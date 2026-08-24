/**
 * Gate signing endpoints. Signing ALWAYS requires the authenticated human
 * principal on the request; there is no service/agent path to these routes.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GateIdSchema } from '@eof/domain';
import { route } from '../lib/route.js';
import { db, type AppCtx } from '../lib/ctx.js';
import { mapGate } from '../lib/mappers.js';
import { ensureGate, signGate } from '../services/gates.js';
import { applyGateSideEffects } from '../services/workflows.js';

export function gateRoutes(app: FastifyInstance, ctx: AppCtx): void {
  route(app, {
    method: 'GET', url: '/api/gates', summary: 'List gates (optionally by object)', tags: ['gates'],
    querystring: z.object({ objectRef: z.string().uuid().optional(), status: z.enum(['open', 'signed', 'rejected', 'held']).optional() }),
    handler: async ({ principal, query }) => db(ctx, principal!, async (c) => {
      const conds: string[] = ['true']; const params: unknown[] = [];
      if (query.objectRef) { params.push(query.objectRef); conds.push(`object_ref=$${params.length}`); }
      if (query.status) { params.push(query.status); conds.push(`status=$${params.length}`); }
      const r = await c.query(`SELECT * FROM gates WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT 200`, params);
      return { gates: r.rows.map(mapGate) };
    }),
  });

  route(app, {
    method: 'POST', url: '/api/gates/open', summary: 'Open a gate for an object (idempotent)', tags: ['gates'],
    body: z.object({
      gateId: GateIdSchema,
      objectType: z.enum(['tenant', 'project', 'should_cost_model', 'procura_event', 'spend_base']),
      objectRef: z.string().uuid(),
    }),
    handler: async ({ principal, body }) => db(ctx, principal!, async (c) => {
      const gate = await ensureGate(c, { tenantId: principal!.tenantId, ...body });
      return { gate: mapGate(gate) };
    }),
  });

  route(app, {
    method: 'POST', url: '/api/gates/:id/sign', summary: 'Sign a gate (human principal required; dual-sign gates need two distinct signers)', tags: ['gates'],
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      decision: z.enum(['approve', 'proceed', 'hold', 'reject']),
      note: z.string().nullable().default(null),
      channel: z.enum(['web', 'teams', 'slack', 'email']).default('web'),
    }),
    handler: async ({ principal, params, body }) => db(ctx, principal!, async (c) => {
      const res = await signGate(c, principal!, {
        gateRef: params.id, decision: body.decision, note: body.note, channel: body.channel,
      });
      if (res.satisfied) await applyGateSideEffects(ctx, c, principal!, res.gate, body.decision);
      return { gate: mapGate(res.gate), satisfied: res.satisfied };
    }),
  });
}
