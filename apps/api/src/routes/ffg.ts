/**
 * M5 — Fuel for Growth (G3). The FUEL FOR GROWTH agent testifies; the PM and
 * the accountable business Manager dual-sign (invariant #3). The API rejects
 * any G3 decision with < 2 distinct qualified signatures (AC F5.3).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runAgentStep } from '@eof/agents';
import { route } from '../lib/route.js';
import { db, audit, type AppCtx } from '../lib/ctx.js';
import { mapGate, mapProject } from '../lib/mappers.js';
import { notFound } from '../lib/http-error.js';
import { ensureGate, signGate } from '../services/gates.js';
import { applyGateSideEffects } from '../services/workflows.js';

export function ffgRoutes(app: FastifyInstance, ctx: AppCtx): void {
  route(app, {
    method: 'GET', url: '/api/ffg/cases', summary: 'FFG cases — projects with an agent verdict', tags: ['ffg'],
    handler: async ({ principal }) => db(ctx, principal!, async (c) => {
      const r = await c.query(
        `SELECT * FROM projects WHERE ffg_decision IS NOT NULL AND deleted_at IS NULL ORDER BY created_at`);
      const cases = [];
      for (const p of r.rows) {
        const gate = p.ffg_decision?.gateRef
          ? (await c.query(`SELECT * FROM gates WHERE id=$1`, [p.ffg_decision.gateRef])).rows[0]
          : (await c.query(`SELECT * FROM gates WHERE gate_id='G3' AND object_ref=$1 ORDER BY created_at DESC LIMIT 1`, [p.id])).rows[0];
        cases.push({ project: mapProject(p), gate: gate ? mapGate(gate) : null });
      }
      return { cases };
    }),
  });

  /** Run (or re-run) the FUEL FOR GROWTH agent on a project. */
  route(app, {
    method: 'POST', url: '/api/ffg/:projectId/run', summary: 'Run the FUEL FOR GROWTH agent (five tests, classification, redesign)', tags: ['ffg'],
    params: z.object({ projectId: z.string().uuid() }),
    handler: async ({ principal, params }) => db(ctx, principal!, async (c) => {
      const pr = await c.query(`SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [params.projectId]);
      if (!pr.rows.length) throw notFound('Project not found');
      const p = pr.rows[0];
      const res = await runAgentStep(ctx.gateway, {
        tenantId: principal!.tenantId, agent: 'FUEL FOR GROWTH',
        context: {
          project: { name: p.name, lever: p.lever, bu: p.bu, pnlElement: p.pnl_element, annualSavingsUsdK: Number(p.annual_savings_usd_k), description: p.description },
        },
      });
      await c.query(
        `INSERT INTO agent_runs (tenant_id, agent, trigger, triggered_by, object_type, object_ref, status, outputs, model_used, provenance)
         VALUES ($1,'FUEL FOR GROWTH','user',$2,'project',$3,$4,$5,$6,$7)`,
        [principal!.tenantId, principal!.userId, params.projectId,
          res.refused ? 'refused' : 'complete', JSON.stringify(res.output), res.modelUsed, JSON.stringify(res.provenance)]);
      if (res.refused) return { refused: true, output: res.output };

      const o = res.output as { tests?: unknown[]; classification?: string; verdict?: string; redesignProposal?: string | null };
      const gate = await ensureGate(c, { tenantId: principal!.tenantId, gateId: 'G3', objectType: 'project', objectRef: params.projectId });
      const decision = {
        verdict: o.verdict ?? '', classification: o.classification ?? null,
        redesignProposal: o.redesignProposal ?? null, tests: o.tests ?? [],
        decision: null, gateRef: gate.id,
      };
      const upd = await c.query(
        `UPDATE projects SET ffg_decision=$2, classification=$3, updated_at=now() WHERE id=$1 RETURNING *`,
        [params.projectId, JSON.stringify(decision), o.classification ?? null]);
      await audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: 'ffg.agent_run', objectType: 'project', objectRef: params.projectId,
        payload: { classification: o.classification },
      });
      return { project: mapProject(upd.rows[0]), gate: mapGate(gate) };
    }),
  });

  /**
   * G3 decision signature — Proceed / Hold-redesign / Reject.
   * Requires 2 distinct signatures with roles pm + manager; single signatures
   * leave the gate open and the decision unapplied.
   */
  route(app, {
    method: 'POST', url: '/api/ffg/:projectId/decide', summary: 'Sign the G3 decision (dual signature: pm + manager)', tags: ['ffg', 'gates'],
    params: z.object({ projectId: z.string().uuid() }),
    body: z.object({
      decision: z.enum(['proceed', 'hold', 'reject']),
      note: z.string().nullable().default(null),
      channel: z.enum(['web', 'teams', 'slack', 'email']).default('web'),
    }),
    handler: async ({ principal, params, body }) => db(ctx, principal!, async (c) => {
      const pr = await c.query(`SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL`, [params.projectId]);
      if (!pr.rows.length) throw notFound('Project not found');
      const gate = await ensureGate(c, { tenantId: principal!.tenantId, gateId: 'G3', objectType: 'project', objectRef: params.projectId });
      const res = await signGate(c, principal!, { gateRef: gate.id, decision: body.decision, note: body.note, channel: body.channel });
      if (res.satisfied) {
        await applyGateSideEffects(ctx, c, principal!, res.gate, body.decision);
        if (body.decision === 'reject') {
          await audit(c, {
            tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
            action: 'ffg.rejected_archived', objectType: 'project', objectRef: params.projectId,
            payload: { reasoning: body.note },
          });
        }
      }
      const upd = await c.query(`SELECT * FROM projects WHERE id=$1`, [params.projectId]);
      return {
        gate: mapGate(res.gate), satisfied: res.satisfied,
        pendingSecondSignature: !res.satisfied,
        project: mapProject(upd.rows[0]),
      };
    }),
  });
}
