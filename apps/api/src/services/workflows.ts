/**
 * Durable workflow engine — pg-boss (Postgres-backed) behind a small facade.
 * Every COACH run is resumable: all state lives in agent_runs.steps, so a
 * killed process/browser resumes from persisted state (F7.5 AC). Swapping to
 * Temporal later means re-implementing startCoachRun/resume with the same
 * DB contract.
 *
 * NO GATE IS EVER AUTO-SIGNED HERE. Runs pause at gate_hold and only continue
 * after a human signature lands via the gates service.
 */
import PgBoss from 'pg-boss';
import { buildCoachGraph, runAgentStep, runCouncil, PROCURA_STAGE_AGENTS } from '@eof/agents';
import type { AgentName, GateId, Principal } from '@eof/domain';
import type { PoolClient } from '@eof/db';
import { dbTenant, audit, type AppCtx } from '../lib/ctx.js';
import { ensureGate } from './gates.js';

const COACH_QUEUE = 'coach-run';

interface CoachJob { runId: string; tenantId: string; [key: string]: unknown }

export async function initWorkflows(ctx: AppCtx): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: ctx.env.DATABASE_URL, schema: 'pgboss' });
  boss.on('error', (e) => console.error('[pg-boss]', e.message));
  await boss.start();
  await boss.createQueue(COACH_QUEUE);
  await boss.work<CoachJob>(COACH_QUEUE, async ([job]) => {
    await processCoachRun(ctx, job.data.tenantId, job.data.runId);
  });
  return boss;
}

/** Start a semi-autonomous COACH run for a project (F7.5). */
export async function startCoachRun(ctx: AppCtx, principal: Principal, projectId: string): Promise<string> {
  return dbTenant(ctx, principal.tenantId, async (c) => {
    const pr = await c.query(`SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL`, [projectId]);
    if (!pr.rows.length) throw new Error('Project not found');
    const project = pr.rows[0];
    const graph = buildCoachGraph({ lever: project.lever, needsNewSupplier: project.needs_new_supplier });
    const steps = graph.map((s, idx) => ({
      idx, agent: s.agent, title: s.title, status: 'pending',
      detail: null, gateId: s.gateAfter, startedAt: null, finishedAt: null,
      council: s.council ?? false,
    }));
    const run = await c.query(
      `INSERT INTO agent_runs (tenant_id, agent, trigger, triggered_by, object_type, object_ref, status, steps, inputs)
       VALUES ($1,'COACH','user',$2,'project',$3,'queued',$4,$5) RETURNING id`,
      [principal.tenantId, principal.userId, projectId, JSON.stringify(steps),
        JSON.stringify({ projectName: project.name, lever: project.lever })],
    );
    await audit(c, {
      tenantId: principal.tenantId, actorId: principal.userId, actorName: principal.name,
      action: 'coach.run.start', objectType: 'project', objectRef: projectId,
      payload: { runId: run.rows[0].id, steps: steps.length },
    });
    await ctx.boss?.send(COACH_QUEUE, { runId: run.rows[0].id, tenantId: principal.tenantId });
    return run.rows[0].id as string;
  });
}

export async function resumeCoachRun(ctx: AppCtx, tenantId: string, runId: string): Promise<void> {
  await ctx.boss?.send(COACH_QUEUE, { runId, tenantId });
}

/** Worker body: execute pending steps until a gate hold or completion. */
export async function processCoachRun(ctx: AppCtx, tenantId: string, runId: string): Promise<void> {
  for (;;) {
    const done = await dbTenant(ctx, tenantId, async (c) => {
      const rr = await c.query(`SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE`, [runId]);
      if (!rr.rows.length) return true;
      const run = rr.rows[0];
      if (['complete', 'failed', 'cancelled'].includes(run.status)) return true;
      const steps: Array<Record<string, unknown>> = run.steps;
      const next = steps.find((s) => s.status === 'pending');
      if (!next) {
        await c.query(`UPDATE agent_runs SET status='complete', updated_at=now() WHERE id=$1`, [runId]);
        return true;
      }
      // If the previous gate step is still unsatisfied, hold.
      const holding = steps.find((s) => s.status === 'gate_hold');
      if (holding) {
        const gate = await c.query(
          `SELECT status FROM gates WHERE gate_id=$1 AND object_ref=$2 ORDER BY created_at DESC LIMIT 1`,
          [holding.gateId, run.object_ref]);
        if (!gate.rows.length || gate.rows[0].status === 'open') {
          await c.query(`UPDATE agent_runs SET status='gate_hold', updated_at=now() WHERE id=$1`, [runId]);
          return true; // still waiting on a human
        }
        holding.status = 'done';
        holding.detail = `${holding.gateId} ${gate.rows[0].status} — resumed by human signature`;
      }

      next.status = 'running';
      next.startedAt = new Date().toISOString();
      await c.query(`UPDATE agent_runs SET status='running', steps=$2, updated_at=now() WHERE id=$1`,
        [runId, JSON.stringify(steps)]);

      const project = (await c.query(`SELECT * FROM projects WHERE id=$1`, [run.object_ref])).rows[0];
      const context = {
        project: {
          name: project?.name, lever: project?.lever, bu: project?.bu, country: project?.country,
          pnlElement: project?.pnl_element, annualSavingsUsdK: Number(project?.annual_savings_usd_k ?? 0),
          stage: project?.stage, needsNewSupplier: project?.needs_new_supplier,
        },
        step: next.title,
      };

      let result;
      if (next.council) {
        result = await runCouncil(ctx.gateway, {
          tenantId, context,
          participants: ['LEVER', 'PULSE', 'SENTINEL', 'FUEL FOR GROWTH', 'CUBE', 'The Recommender'],
        });
        if (result.ok) {
          const o = result.output as { stances?: unknown[]; consensus?: string; dissent?: string };
          await c.query(
            `INSERT INTO council_sessions (tenant_id, project_ref, participants, transcript, consensus, dissent, recorded_by)
             VALUES ($1,$2,$3,$4,$5,$6,'SCRIBE')`,
            [tenantId, run.object_ref,
              JSON.stringify(['LEVER', 'PULSE', 'SENTINEL', 'FUEL FOR GROWTH', 'CUBE', 'The Recommender']),
              JSON.stringify(o.stances ?? []), o.consensus ?? null, o.dissent ?? null]);
        }
      } else {
        result = await runAgentStep(ctx.gateway, { tenantId, agent: next.agent as AgentName, context });
      }

      next.status = result.refused ? 'refused' : 'done';
      next.finishedAt = new Date().toISOString();
      next.detail = result.refused
        ? String((result.output as { refusal?: string }).refusal ?? 'refused')
        : summarise(result.output);

      const outputs = { ...(run.outputs ?? {}), [String(next.idx)]: result.output };
      const gateHolds: string[] = run.gate_holds ?? [];

      if (next.gateId && !result.refused) {
        const gate = await ensureGate(c, {
          tenantId, gateId: next.gateId as GateId,
          objectType: 'project', objectRef: run.object_ref,
        });
        gateHolds.push(gate.id);
        next.status = 'gate_hold';
      }

      await c.query(
        `UPDATE agent_runs SET steps=$2, outputs=$3, gate_holds=$4, model_used=$5,
           tokens_in=tokens_in+$6, tokens_out=tokens_out+$7,
           provenance=$8, status=$9, updated_at=now() WHERE id=$1`,
        [runId, JSON.stringify(steps), JSON.stringify(outputs), JSON.stringify(gateHolds),
          result.modelUsed, result.tokensIn, result.tokensOut,
          JSON.stringify(result.provenance), next.status === 'gate_hold' ? 'gate_hold' : 'running']);

      await audit(c, {
        tenantId, actorId: null, actorName: `agent:${next.agent}`,
        action: 'agent.step', objectType: 'project', objectRef: run.object_ref,
        payload: { runId, step: next.title, status: next.status },
      });

      return next.status === 'gate_hold'; // stop loop at a human gate ◆
    });
    if (done) return;
  }
}

function summarise(output: Record<string, unknown>): string {
  const s = JSON.stringify(output);
  return s.length > 220 ? `${s.slice(0, 220)}…` : s;
}

/* ───────────────────── Procura crew progression ───────────────────── */

/** Deterministic demo bid economics anchored to the should-cost target. */
function demoBidEconomics(supplier: string, targetUsd: number) {
  let h = 0;
  for (let i = 0; i < supplier.length; i++) h = (h * 31 + supplier.charCodeAt(i)) % 1000;
  const spread = 0.92 + (h % 160) / 1000; // 0.92 – 1.08
  const amount = Math.round(targetUsd * spread * 100) / 100;
  const margin = supplier.includes('SwiftHaul') ? 2.1 : 8 + (h % 60) / 10; // SwiftHaul models sub-floor
  return { amount, margin };
}

/**
 * Run the crew for the event's current stage and advance where no human gate
 * blocks. Human gates (P-INTAKE at intake, P-RFP after rfp_build, P-AWARD at
 * recommendation) are never crossed here.
 */
export async function runProcuraStage(ctx: AppCtx, tenantId: string, eventId: string): Promise<void> {
  await dbTenant(ctx, tenantId, async (c) => {
    const er = await c.query(`SELECT * FROM procura_events WHERE id=$1 FOR UPDATE`, [eventId]);
    if (!er.rows.length) return;
    const ev = er.rows[0];
    const log: Array<{ ts: string; line: string }> = ev.log ?? [];
    const outputs = ev.crew_outputs ?? { researcher: [], rfp_architect: [], bid_handler: [], recommender: [] };
    const push = (line: string) => log.push({ ts: new Date().toISOString(), line });

    const runCrewAgent = async (agent: AgentName, slot: keyof typeof outputs, title: string) => {
      const res = await runAgentStep(ctx.gateway, {
        tenantId, agent,
        context: {
          stage: ev.stage, shouldCostTargetUsd: Number(ev.should_cost_target_usd ?? 0),
          baselineUsd: Number(ev.baseline_usd ?? 0),
          bids: (ev.bids ?? []).map((b: { supplier: string; sealed: boolean; amountUsd: number | null }) =>
            b.sealed ? { supplier: b.supplier, sealed: true } : b), // sealed bids stay sealed to agents too
          evaluationMatrix: ev.evaluation_matrix,
        },
      });
      await c.query(
        `INSERT INTO agent_runs (tenant_id, agent, trigger, object_type, object_ref, status, outputs, model_used, provenance)
         VALUES ($1,$2,'coach','procura_event',$3,$4,$5,$6,$7)`,
        [tenantId, agent, eventId, res.refused ? 'refused' : 'complete',
          JSON.stringify(res.output), res.modelUsed, JSON.stringify(res.provenance)]);
      if (!res.refused) {
        (outputs[slot] as unknown[]).push({
          title, body: extractBody(res.output), data: res.output, provenance: res.provenance,
        });
      }
      return res;
    };

    if (ev.stage === 'research') {
      const res = await runCrewAgent('The Researcher', 'researcher', 'Market view & long-list');
      const band = (res.output as { priceBand?: { lowUsd: number; highUsd: number } }).priceBand;
      push(`RESEARCHER: long-list built${band ? ` · expected band $${band.lowUsd}–${band.highUsd} vs should-cost $${ev.should_cost_target_usd}` : ''}`);
      // auto-advance into rfp_build (no gate between research and rfp_build)
      const rfp = await runCrewAgent('The RFP Architect', 'rfp_architect', 'RFP & evaluation matrix (draft, locks at P-RFP)');
      const matrix = (rfp.output as { evaluationMatrix?: { criteria: unknown[] } }).evaluationMatrix;
      const evalMatrix = matrix ? { criteria: matrix.criteria, lockedAt: null } : ev.evaluation_matrix;
      push('RFP ARCHITECT: RFP drafted · evaluation matrix prepared — awaiting human P-RFP sign-off ◆');
      await ensureGate(c, { tenantId, gateId: 'P-RFP', objectType: 'procura_event', objectRef: eventId });
      await c.query(
        `UPDATE procura_events SET stage='rfp_build', crew_outputs=$2, evaluation_matrix=$3, log=$4 WHERE id=$1`,
        [eventId, JSON.stringify(outputs), JSON.stringify(evalMatrix), JSON.stringify(log)]);
      return;
    }

    if (ev.stage === 'distribute_bids') {
      await runCrewAgent('The Bid Handler', 'bid_handler', 'Distribution & bid status');
      push('BID HANDLER: distribution running · equal-information Q&A · bids sealed until deadline');
      await c.query(`UPDATE procura_events SET crew_outputs=$2, log=$3 WHERE id=$1`,
        [eventId, JSON.stringify(outputs), JSON.stringify(log)]);
      return;
    }

    if (ev.stage === 'evaluation') {
      // Unseal received bids; fill demo economics where none were entered.
      const floor = await tenantFloor(c, tenantId);
      const target = Number(ev.should_cost_target_usd ?? 0);
      const bids = (ev.bids ?? []).map((b: Record<string, unknown>) => {
        if (!b.receivedAt) return b;
        const econ = b.amountUsd != null
          ? { amount: Number(b.amountUsd), margin: Number(b.supplierMarginPct ?? 10) }
          : demoBidEconomics(String(b.supplier), target || 100);
        return {
          ...b, sealed: false, amountUsd: econ.amount, supplierMarginPct: econ.margin,
          tcoUsd: Math.round(econ.amount * 1.04 * 100) / 100,
          subFloor: econ.margin < floor,
        };
      });
      const subFloorBids = bids.filter((b: { subFloor?: boolean }) => b.subFloor);
      if (subFloorBids.length) {
        push(`SENTINEL: ${subFloorBids.length} bid(s) model supplier margin below the ${floor}% floor — flagged as supply risk, cannot be classified savings without override`);
      }
      await c.query(`UPDATE procura_events SET bids=$2 WHERE id=$1`, [eventId, JSON.stringify(bids)]);
      ev.bids = bids;
      await runCrewAgent('The Bid Handler', 'bid_handler', 'Scored comparison & TCO models');
      push('BID HANDLER: bids unsealed at deadline · scored against the locked matrix · TCO normalised');
      const rec = await runCrewAgent('The Recommender', 'recommender', 'Award recommendation & decision package');
      if (!rec.refused) push('RECOMMENDER: decision package ready — award gate is yours ◆');
      await ensureGate(c, { tenantId, gateId: 'P-AWARD', objectType: 'procura_event', objectRef: eventId });
      await c.query(
        `UPDATE procura_events SET stage='recommendation', crew_outputs=$2, log=$3 WHERE id=$1`,
        [eventId, JSON.stringify(outputs), JSON.stringify(log)]);
      return;
    }
  });
}

async function tenantFloor(c: PoolClient, tenantId: string): Promise<number> {
  const r = await c.query(`SELECT settings->>'fairMarginFloorPct' AS floor FROM tenants WHERE id=$1`, [tenantId]);
  return Number(r.rows[0]?.floor ?? 8);
}

function extractBody(output: Record<string, unknown>): string {
  for (const key of ['marketStructure', 'reasoning', 'narrative', 'body']) {
    const v = output[key];
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object' && typeof (v as Record<string, unknown>).reasoning === 'string') {
      return (v as Record<string, string>).reasoning;
    }
  }
  const s = JSON.stringify(output);
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
}

/* ───────────── Gate side-effects (called after a satisfied signature) ───────────── */

export async function applyGateSideEffects(
  ctx: AppCtx, c: PoolClient, principal: Principal,
  gate: { id: string; gate_id: GateId; object_type: string; object_ref: string; status: string },
  decision: string,
): Promise<void> {
  const tenantId = principal.tenantId;

  if (gate.gate_id === 'G2' && gate.object_type === 'should_cost_model' && gate.status === 'signed') {
    await c.query(
      `UPDATE should_cost_models SET status='g2_signed', frozen_version=coalesce(frozen_version,0)+1, updated_at=now() WHERE id=$1`,
      [gate.object_ref]);
  }

  if (gate.gate_id === 'G3' && gate.object_type === 'project' && gate.status !== 'open') {
    const mapped = decision === 'approve' ? 'proceed' : decision;
    await c.query(
      `UPDATE projects SET ffg_decision = coalesce(ffg_decision,'{}'::jsonb) || jsonb_build_object('decision', $2::text, 'gateRef', $3::text), updated_at=now() WHERE id=$1`,
      [gate.object_ref, mapped, gate.id]);
  }

  if (gate.gate_id === 'G5' && gate.object_type === 'project' && gate.status === 'signed') {
    await c.query(`UPDATE projects SET stage='Forecast', updated_at=now() WHERE id=$1 AND stage='Pipeline'`, [gate.object_ref]);
  }
  if (gate.gate_id === 'G6' && gate.object_type === 'project' && gate.status === 'signed') {
    await c.query(`UPDATE projects SET stage='Delivered', updated_at=now() WHERE id=$1`, [gate.object_ref]);
  }

  if (gate.gate_id === 'P-INTAKE' && gate.status === 'signed') {
    await c.query(
      `UPDATE procura_events SET stage='research',
         log = log || $2::jsonb WHERE id=$1 AND stage='intake'`,
      [gate.object_ref, JSON.stringify([{ ts: new Date().toISOString(), line: `◆ P-INTAKE approved · ${principal.name} · scope confirmed — crew launched` }])]);
    // crew runs after the transaction commits
    queueMicrotask(() => { void runProcuraStage(ctx, tenantId, gate.object_ref).catch((e) => console.error('[procura]', e)); });
  }

  if (gate.gate_id === 'P-RFP' && gate.status === 'signed') {
    // Lock the evaluation matrix at distribution — immutable afterwards (F8.3 AC).
    await c.query(
      `UPDATE procura_events SET stage='distribute_bids',
         evaluation_matrix = jsonb_set(evaluation_matrix, '{lockedAt}', to_jsonb(now()::text)),
         log = log || $2::jsonb
       WHERE id=$1 AND stage='rfp_build'`,
      [gate.object_ref, JSON.stringify([{ ts: new Date().toISOString(), line: `◆ P-RFP signed off · ${principal.name} · evaluation matrix locked · RFP distributed` }])]);
    queueMicrotask(() => { void runProcuraStage(ctx, tenantId, gate.object_ref).catch((e) => console.error('[procura]', e)); });
  }

  // Resume any COACH runs holding on this gate.
  const held = await c.query(
    `SELECT id FROM agent_runs WHERE status='gate_hold' AND gate_holds @> $1::jsonb`,
    [JSON.stringify([gate.id])]);
  for (const row of held.rows) {
    queueMicrotask(() => { void resumeCoachRun(ctx, tenantId, row.id).catch(() => {}); });
  }
}
