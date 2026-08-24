/**
 * M4 — Should-Cost / ZBC. Agent layer and analyst layer are separate and the
 * analyst layer is NEVER overwritten by agents (invariant #6); agents never
 * overwrite analyst values here either — analyst edits only touch analystValue.
 * G2 signature freezes a version (F4.4); SENTINEL blocks sub-floor "savings".
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { route } from '../lib/route.js';
import { db, audit, type AppCtx } from '../lib/ctx.js';
import { mapShouldCost } from '../lib/mappers.js';
import { badRequest, conflict, notFound } from '../lib/http-error.js';
import { ensureGate, signGate } from '../services/gates.js';
import { applyGateSideEffects } from '../services/workflows.js';

export function shouldCostRoutes(app: FastifyInstance, ctx: AppCtx): void {
  route(app, {
    method: 'GET', url: '/api/should-cost', summary: 'List should-cost models', tags: ['should-cost'],
    handler: async ({ principal }) => db(ctx, principal!, async (c) => {
      const r = await c.query(`SELECT * FROM should_cost_models WHERE deleted_at IS NULL ORDER BY created_at`);
      return { models: r.rows.map(mapShouldCost) };
    }),
  });

  route(app, {
    method: 'GET', url: '/api/should-cost/:id', summary: 'Model detail', tags: ['should-cost'],
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ principal, params }) => db(ctx, principal!, async (c) => {
      const r = await c.query(`SELECT * FROM should_cost_models WHERE id=$1 AND deleted_at IS NULL`, [params.id]);
      if (!r.rows.length) throw notFound('Model not found');
      const gates = await c.query(`SELECT * FROM gates WHERE object_ref=$1 ORDER BY created_at`, [params.id]);
      return {
        model: mapShouldCost(r.rows[0]),
        gates: gates.rows.map((g) => ({ id: g.id, gateId: g.gate_id, status: g.status, signatures: g.signatures })),
      };
    }),
  });

  /** Analyst edit — writes analystValue ONLY; agent layer untouched (AC F4.2). */
  route(app, {
    method: 'PATCH', url: '/api/should-cost/:id/analyst-layer', summary: 'Analyst edits (never touches the agent layer)', tags: ['should-cost'],
    access: ['analyst', 'pm', 'admin', 'owner'],
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      edits: z.array(z.object({ elementName: z.string(), analystValue: z.number().nullable() })).min(1),
    }),
    handler: async ({ principal, params, body }) => db(ctx, principal!, async (c) => {
      const r = await c.query(`SELECT * FROM should_cost_models WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [params.id]);
      if (!r.rows.length) throw notFound('Model not found');
      const m = r.rows[0];
      if (m.status === 'g2_signed') throw conflict('Model is G2-frozen; open a new draft version to edit.', 'FROZEN');
      const structure = (m.structure as Array<Record<string, unknown>>).map((el) => {
        const edit = body.edits.find((e) => e.elementName === el.name);
        // ONLY analystValue may change here — agentValue & provenance preserved verbatim.
        return edit ? { ...el, analystValue: edit.analystValue } : el;
      });
      const unknown = body.edits.filter((e) => !structure.some((el) => el.name === e.elementName));
      if (unknown.length) throw badRequest(`Unknown elements: ${unknown.map((u) => u.elementName).join(', ')}`);
      const upd = await c.query(
        `UPDATE should_cost_models SET structure=$2, updated_at=now() WHERE id=$1 RETURNING *`,
        [params.id, JSON.stringify(structure)]);
      await audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: 'shouldcost.analyst_edit', objectType: 'should_cost_model', objectRef: params.id,
        payload: { edits: body.edits },
      });
      return { model: mapShouldCost(upd.rows[0]) };
    }),
  });

  /** ZBC challenge outcome (F4.1). */
  route(app, {
    method: 'PATCH', url: '/api/should-cost/:id/zbc', summary: 'Record the zero-based challenge outcome', tags: ['should-cost'],
    access: ['analyst', 'pm', 'manager', 'admin', 'owner'],
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      outcome: z.enum(['exists_justified', 'reduce', 'eliminate', 'pending']),
      rationale: z.string().nullable().default(null),
    }),
    handler: async ({ principal, params, body }) => db(ctx, principal!, async (c) => {
      const upd = await c.query(
        `UPDATE should_cost_models
         SET zbc = jsonb_build_object('question', zbc->>'question', 'outcome', $2::text, 'rationale', $3::text), updated_at=now()
         WHERE id=$1 AND deleted_at IS NULL RETURNING *`,
        [params.id, body.outcome, body.rationale]);
      if (!upd.rows.length) throw notFound('Model not found');
      await audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: 'shouldcost.zbc', objectType: 'should_cost_model', objectRef: params.id, payload: body,
      });
      return { model: mapShouldCost(upd.rows[0]) };
    }),
  });

  /**
   * Savings-classification guard (P2/F4.3): a scenario modelling supplier
   * margin below the tenant fair-margin floor cannot be classified "savings"
   * without an explicit override + reason — audited either way.
   */
  route(app, {
    method: 'POST', url: '/api/should-cost/:id/classify-savings', summary: 'Classify a negotiation scenario as savings (SENTINEL floor guard)', tags: ['should-cost'],
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      scenarioPriceUsd: z.number().positive(),
      supplierMarginPct: z.number(),
      override: z.boolean().default(false),
      overrideReason: z.string().nullable().default(null),
    }),
    handler: async ({ principal, params, body }) => db(ctx, principal!, async (c) => {
      const r = await c.query(`SELECT * FROM should_cost_models WHERE id=$1 AND deleted_at IS NULL`, [params.id]);
      if (!r.rows.length) throw notFound('Model not found');
      const floor = Number(r.rows[0].fair_margin_floor_pct);
      const subFloor = body.supplierMarginPct < floor;
      if (subFloor && (!body.override || !body.overrideReason)) {
        await audit(c, {
          tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
          action: 'sentinel.subfloor_block', objectType: 'should_cost_model', objectRef: params.id,
          payload: { scenarioPriceUsd: body.scenarioPriceUsd, supplierMarginPct: body.supplierMarginPct, floor },
        });
        throw conflict(
          `SENTINEL: scenario models supplier margin ${body.supplierMarginPct}% below the ${floor}% fair-margin floor — this is supply risk, not savings. Provide override=true with an overrideReason to proceed (audited).`,
          'SUB_FLOOR');
      }
      await audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: subFloor ? 'sentinel.subfloor_override' : 'shouldcost.classified_savings',
        objectType: 'should_cost_model', objectRef: params.id,
        payload: { ...body, floor },
      });
      const gapUsd = Number(r.rows[0].current_price_usd) - body.scenarioPriceUsd;
      return { classified: 'savings', subFloor, overridden: subFloor, gapUsd, floor };
    }),
  });

  /** G2 — analyst acceptance freezes the version (F4.4). */
  route(app, {
    method: 'POST', url: '/api/should-cost/:id/sign-g2', summary: 'G2 — analyst signs & freezes the clean-sheet', tags: ['should-cost', 'gates'],
    access: ['analyst', 'pm'],
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ note: z.string().nullable().default(null) }).default({ note: null }),
    handler: async ({ principal, params, body }) => db(ctx, principal!, async (c) => {
      const r = await c.query(`SELECT status FROM should_cost_models WHERE id=$1 AND deleted_at IS NULL`, [params.id]);
      if (!r.rows.length) throw notFound('Model not found');
      if (r.rows[0].status === 'g2_signed') throw conflict('Already G2-signed.', 'ALREADY_SIGNED');
      const gate = await ensureGate(c, { tenantId: principal!.tenantId, gateId: 'G2', objectType: 'should_cost_model', objectRef: params.id });
      const res = await signGate(c, principal!, { gateRef: gate.id, decision: 'approve', note: body.note });
      if (res.satisfied) await applyGateSideEffects(ctx, c, principal!, res.gate, 'approve');
      const upd = await c.query(`SELECT * FROM should_cost_models WHERE id=$1`, [params.id]);
      return { model: mapShouldCost(upd.rows[0]) };
    }),
  });
}
