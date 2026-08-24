/**
 * M8 — Embedded Procura events. Eligibility per F8.1; RFP cannot distribute
 * without the P-RFP signature; the award ALWAYS requires a human signature
 * with award authority; the evaluation matrix is immutable after lock (AC F8.4).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { procuraEligible } from '@eof/domain';
import { route } from '../lib/route.js';
import { db, audit, type AppCtx } from '../lib/ctx.js';
import { mapGate, mapProcura, mapProject } from '../lib/mappers.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/http-error.js';
import { ensureGate, findGate, signGate } from '../services/gates.js';
import { applyGateSideEffects, runProcuraStage } from '../services/workflows.js';

export function procuraRoutes(app: FastifyInstance, ctx: AppCtx): void {
  route(app, {
    method: 'GET', url: '/api/procura', summary: 'List Procura events', tags: ['procura'],
    handler: async ({ principal }) => db(ctx, principal!, async (c) => {
      const r = await c.query(
        `SELECT pe.*, p.name AS project_name FROM procura_events pe
         JOIN projects p ON p.id = pe.project_ref ORDER BY pe.created_at DESC`);
      return { events: r.rows.map((row) => ({ ...mapProcura(row), projectName: row.project_name })) };
    }),
  });

  route(app, {
    method: 'GET', url: '/api/procura/:id', summary: 'Event detail (crew outputs, matrix, bids, log)', tags: ['procura'],
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ principal, params }) => db(ctx, principal!, async (c) => {
      const r = await c.query(`SELECT * FROM procura_events WHERE id=$1`, [params.id]);
      if (!r.rows.length) throw notFound('Event not found');
      const gates = await c.query(`SELECT * FROM gates WHERE object_ref=$1 ORDER BY created_at`, [params.id]);
      const ev = mapProcura(r.rows[0]);
      // Sealed bids never expose amounts (F8.3).
      ev.bids = ev.bids.map((b: Record<string, unknown>) =>
        b.sealed ? { id: b.id, supplier: b.supplier, receivedAt: b.receivedAt, sealed: true } : b);
      return { event: ev, gates: gates.rows.map(mapGate) };
    }),
  });

  /** Convert an eligible project into a Procura event (F8.1/F8.2). */
  route(app, {
    method: 'POST', url: '/api/projects/:projectId/convert-procura', summary: 'Convert project → Procura procurement event', tags: ['procura'],
    access: ['pm', 'procurement', 'manager', 'admin', 'owner'],
    params: z.object({ projectId: z.string().uuid() }),
    handler: async ({ principal, params }) => db(ctx, principal!, async (c) => {
      const pr = await c.query(`SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [params.projectId]);
      if (!pr.rows.length) throw notFound('Project not found');
      const p = pr.rows[0];
      if (p.procura_event_id) throw conflict('Project already has a Procura event.', 'ALREADY_CONVERTED');
      if (!procuraEligible({ lever: p.lever, needsNewSupplier: p.needs_new_supplier })) {
        throw badRequest('Project is not Procura-eligible: requires lever Price/Specifications/RightSource or a new supplier.', 'NOT_ELIGIBLE');
      }
      // Frozen (G2-signed) should-cost is the only referencable version (F4.4).
      const sc = p.should_cost_model_id
        ? (await c.query(`SELECT * FROM should_cost_models WHERE id=$1 AND status='g2_signed'`, [p.should_cost_model_id])).rows[0]
        : null;
      const target = sc
        ? (sc.structure as Array<{ agentValue: number | null; analystValue: number | null }>)
            .reduce((a, el) => a + Number(el.analystValue ?? el.agentValue ?? 0), 0)
        : null;
      const ev = await c.query(
        `INSERT INTO procura_events (tenant_id, project_ref, should_cost_target_usd, should_cost_model_ref, baseline_usd, stage, log)
         VALUES ($1,$2,$3,$4,$5,'intake',$6) RETURNING *`,
        [principal!.tenantId, params.projectId,
          target != null ? Math.round(target * 100) / 100 : null, sc?.id ?? null,
          sc ? Number(sc.current_price_usd) : null,
          JSON.stringify([{ ts: new Date().toISOString(), line: `Converted to Procurement project by ${principal!.name} · brief${sc ? ' + frozen should-cost target' : ''} handed to Procura Crew · awaiting P-INTAKE ◆` }])]);
      await c.query(`UPDATE projects SET procura_event_id=$2, updated_at=now() WHERE id=$1`, [params.projectId, ev.rows[0].id]);
      const gate = await ensureGate(c, { tenantId: principal!.tenantId, gateId: 'P-INTAKE', objectType: 'procura_event', objectRef: ev.rows[0].id });
      await audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: 'procura.convert', objectType: 'procura_event', objectRef: ev.rows[0].id,
        payload: { projectId: params.projectId, shouldCostTargetUsd: target },
      });
      return { event: mapProcura(ev.rows[0]), intakeGate: mapGate(gate) };
    }),
  });

  /** Evaluation matrix edits — rejected once locked (immutability AC). */
  route(app, {
    method: 'PATCH', url: '/api/procura/:id/matrix', summary: 'Edit evaluation matrix (only before lock)', tags: ['procura'],
    access: ['procurement', 'manager', 'admin'],
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ criteria: z.array(z.object({ name: z.string(), weightPct: z.number() })).min(1) }),
    handler: async ({ principal, params, body }) => db(ctx, principal!, async (c) => {
      const r = await c.query(`SELECT evaluation_matrix FROM procura_events WHERE id=$1 FOR UPDATE`, [params.id]);
      if (!r.rows.length) throw notFound('Event not found');
      if (r.rows[0].evaluation_matrix?.lockedAt) {
        throw conflict('Evaluation matrix is locked (locked at distribution) and immutable for the life of the event.', 'MATRIX_LOCKED');
      }
      const upd = await c.query(
        `UPDATE procura_events SET evaluation_matrix=$2 WHERE id=$1 RETURNING *`,
        [params.id, JSON.stringify({ criteria: body.criteria, lockedAt: null })]);
      return { event: mapProcura(upd.rows[0]) };
    }),
  });

  /** Manual bid entry (v1 intake is e-mail parsing + manual entry). */
  route(app, {
    method: 'POST', url: '/api/procura/:id/bids', summary: 'Log a received bid (sealed until deadline)', tags: ['procura'],
    access: ['procurement', 'admin'],
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      supplier: z.string().min(1),
      amountUsd: z.number().positive().nullable().default(null),
      supplierMarginPct: z.number().nullable().default(null),
      notes: z.string().nullable().default(null),
    }),
    handler: async ({ principal, params, body }) => db(ctx, principal!, async (c) => {
      const r = await c.query(`SELECT * FROM procura_events WHERE id=$1 FOR UPDATE`, [params.id]);
      if (!r.rows.length) throw notFound('Event not found');
      const ev = r.rows[0];
      if (!['distribute_bids', 'evaluation'].includes(ev.stage)) {
        throw badRequest(`Bids can only be logged during distribute_bids/evaluation (event is at ${ev.stage}).`, 'WRONG_STAGE');
      }
      const bids = ev.bids ?? [];
      const existing = bids.find((b: { supplier: string }) => b.supplier === body.supplier);
      if (existing) {
        existing.receivedAt = new Date().toISOString();
        existing.amountUsd = body.amountUsd; existing.supplierMarginPct = body.supplierMarginPct;
        existing.notes = body.notes; existing.sealed = true;
      } else {
        bids.push({
          id: `b${bids.length + 1}`, supplier: body.supplier, receivedAt: new Date().toISOString(),
          sealed: true, amountUsd: body.amountUsd, unit: null, tcoUsd: null,
          supplierMarginPct: body.supplierMarginPct, subFloor: false, notes: body.notes,
        });
      }
      const log = [...(ev.log ?? []), { ts: new Date().toISOString(), line: `BID HANDLER: bid received from ${body.supplier} — sealed until deadline` }];
      const upd = await c.query(`UPDATE procura_events SET bids=$2, log=$3 WHERE id=$1 RETURNING *`,
        [params.id, JSON.stringify(bids), JSON.stringify(log)]);
      await audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: 'procura.bid_logged', objectType: 'procura_event', objectRef: params.id,
        payload: { supplier: body.supplier },
      });
      const out = mapProcura(upd.rows[0]);
      out.bids = out.bids.map((b: Record<string, unknown>) => b.sealed ? { id: b.id, supplier: b.supplier, receivedAt: b.receivedAt, sealed: true } : b);
      return { event: out };
    }),
  });

  /**
   * Advance distribute_bids → evaluation (bid deadline). Unseals bids, runs
   * SENTINEL sub-floor checks, scores against the LOCKED matrix and prepares
   * the recommendation + P-AWARD gate. Gated stages never advance here.
   */
  route(app, {
    method: 'POST', url: '/api/procura/:id/advance', summary: 'Close bidding & evaluate (procurement)', tags: ['procura'],
    access: ['procurement', 'manager', 'admin'],
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ principal, params }) => db(ctx, principal!, async (c) => {
      const r = await c.query(`SELECT * FROM procura_events WHERE id=$1 FOR UPDATE`, [params.id]);
      if (!r.rows.length) throw notFound('Event not found');
      const ev = r.rows[0];
      if (ev.stage === 'intake') throw forbidden('P-INTAKE is a human gate — sign it to launch the crew.', 'GATE_REQUIRED');
      if (ev.stage === 'rfp_build') throw forbidden('P-RFP is a human gate — the RFP cannot distribute without sign-off.', 'GATE_REQUIRED');
      if (ev.stage === 'recommendation') throw forbidden('P-AWARD is a human gate — use /award.', 'GATE_REQUIRED');
      if (ev.stage !== 'distribute_bids') throw badRequest(`Nothing to advance from ${ev.stage}.`, 'WRONG_STAGE');
      const rfpGate = await findGate(c, 'P-RFP', params.id);
      if (!rfpGate || rfpGate.status !== 'signed') {
        throw forbidden('RFP was never signed — distribution invalid.', 'GATE_REQUIRED');
      }
      await c.query(`UPDATE procura_events SET stage='evaluation' WHERE id=$1`, [params.id]);
      await audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: 'procura.bids_closed', objectType: 'procura_event', objectRef: params.id,
      });
      // evaluation + recommendation crew runs after this transaction commits
      queueMicrotask(() => { void runProcuraStage(ctx, principal!.tenantId, params.id).catch((e) => console.error('[procura]', e)); });
      return { queued: true };
    }),
  });

  /**
   * P-AWARD — the human award decision. The Crew never awards (invariant #2):
   * this route demands a human principal with award authority, signs the gate,
   * writes the award and writes realised savings back to the project (F8.4).
   */
  route(app, {
    method: 'POST', url: '/api/procura/:id/award', summary: 'Sign the award (human, award authority required)', tags: ['procura', 'gates'],
    access: ['procurement', 'manager'],
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      decision: z.string().min(1),
      realisedSavingsUsdK: z.number().nullable().default(null),
      note: z.string().nullable().default(null),
    }),
    handler: async ({ principal, params, body }) => db(ctx, principal!, async (c) => {
      const r = await c.query(`SELECT * FROM procura_events WHERE id=$1 FOR UPDATE`, [params.id]);
      if (!r.rows.length) throw notFound('Event not found');
      const ev = r.rows[0];
      if (ev.stage !== 'recommendation') throw badRequest(`Award happens at recommendation (event is at ${ev.stage}).`, 'WRONG_STAGE');

      const gate = await ensureGate(c, { tenantId: principal!.tenantId, gateId: 'P-AWARD', objectType: 'procura_event', objectRef: params.id });
      const res = await signGate(c, principal!, { gateRef: gate.id, decision: 'approve', note: body.note });
      if (!res.satisfied) return { gate: mapGate(res.gate), satisfied: false };
      await applyGateSideEffects(ctx, c, principal!, res.gate, 'approve');

      const award = { decision: body.decision, signerUserId: principal!.userId, signerName: principal!.name, ts: new Date().toISOString() };
      const log = [...(ev.log ?? []), { ts: new Date().toISOString(), line: `◆ P-AWARD signed · ${principal!.name} · ${body.decision}` },
        { ts: new Date().toISOString(), line: 'COACH: contract summary & realised savings written back · SCRIBE funnel updated' }];
      const upd = await c.query(
        `UPDATE procura_events SET stage='complete', award=$2, log=$3 WHERE id=$1 RETURNING *`,
        [params.id, JSON.stringify(award), JSON.stringify(log)]);

      // Write-back: realised savings & contract summary into the project.
      const project = (await c.query(`SELECT * FROM projects WHERE id=$1 FOR UPDATE`, [ev.project_ref])).rows[0];
      if (project) {
        const realised = body.realisedSavingsUsdK ?? Number(project.annual_savings_usd_k);
        await c.query(
          `UPDATE projects SET
             annual_savings_usd_k=$2,
             stage = CASE WHEN stage='Forecast' THEN 'Committed' ELSE stage END,
             description = description || $3,
             updated_at=now()
           WHERE id=$1`,
          [ev.project_ref, realised, `\n\n[Procura award ${new Date().toISOString().slice(0, 10)}] ${body.decision} — realised savings $${realised}k/yr.`]);
      }
      await audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: 'procura.award', objectType: 'procura_event', objectRef: params.id,
        payload: { decision: body.decision, realisedSavingsUsdK: body.realisedSavingsUsdK },
      });
      const projectRow = (await c.query(`SELECT * FROM projects WHERE id=$1`, [ev.project_ref])).rows[0];
      return { event: mapProcura(upd.rows[0]), project: projectRow ? mapProject(projectRow) : null, satisfied: true };
    }),
  });

  /** Kick the crew for the current stage (research/distribute_bids/evaluation). */
  route(app, {
    method: 'POST', url: '/api/procura/:id/run-crew', summary: 'Run the crew for the current stage', tags: ['procura'],
    access: ['procurement', 'pm', 'manager', 'admin'],
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ principal, params }) => {
      await runProcuraStage(ctx, principal!.tenantId, params.id);
      return db(ctx, principal!, async (c) => {
        const r = await c.query(`SELECT * FROM procura_events WHERE id=$1`, [params.id]);
        if (!r.rows.length) throw notFound('Event not found');
        const ev = mapProcura(r.rows[0]);
        ev.bids = ev.bids.map((b: Record<string, unknown>) => b.sealed ? { id: b.id, supplier: b.supplier, receivedAt: b.receivedAt, sealed: true } : b);
        return { event: ev };
      });
    },
  });
}
