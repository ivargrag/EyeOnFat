/**
 * M10 — Admin: tenant settings (FY, currencies, margin floor), users/roles,
 * model registry, audit log viewer, DSR export. All destructive actions are
 * soft-delete + audit.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { FYConfigSchema, RoleSchema } from '@eof/domain';
import { route } from '../lib/route.js';
import { db, dbGlobal, audit, type AppCtx } from '../lib/ctx.js';
import { notFound } from '../lib/http-error.js';

export function adminRoutes(app: FastifyInstance, ctx: AppCtx): void {
  route(app, {
    method: 'GET', url: '/api/admin/settings', summary: 'Tenant settings', tags: ['admin'], access: ['admin', 'owner'],
    handler: async ({ principal }) => dbGlobal(ctx, async (c) => {
      const r = await c.query(`SELECT slug, name, settings FROM tenants WHERE id=$1`, [principal!.tenantId]);
      return { tenant: r.rows[0] };
    }),
  });

  route(app, {
    method: 'PATCH', url: '/api/admin/settings', summary: 'Update tenant settings (FY, currencies, margin floor…)', tags: ['admin'], access: ['admin', 'owner'],
    body: FYConfigSchema.partial(),
    handler: async ({ principal, body }) => db(ctx, principal!, async (c) => {
      const cur = await c.query(`SELECT settings FROM tenants WHERE id=$1`, [principal!.tenantId]);
      const merged = { ...cur.rows[0].settings, ...body };
      await c.query(`UPDATE tenants SET settings=$2 WHERE id=$1`, [principal!.tenantId, JSON.stringify(merged)]);
      await audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: 'admin.settings_update', payload: body,
      });
      return { settings: merged };
    }),
  });

  route(app, {
    method: 'GET', url: '/api/admin/users', summary: 'List users & roles', tags: ['admin'], access: ['admin', 'owner'],
    handler: async ({ principal }) => db(ctx, principal!, async (c) => {
      const r = await c.query(
        `SELECT id, email, name, roles, mfa_enabled, award_authority, active, created_at
         FROM users WHERE deleted_at IS NULL ORDER BY name`);
      return {
        users: r.rows.map((u) => ({
          id: u.id, email: u.email, name: u.name, roles: u.roles, mfaEnabled: u.mfa_enabled,
          awardAuthority: u.award_authority, active: u.active, createdAt: u.created_at,
        })),
      };
    }),
  });

  route(app, {
    method: 'POST', url: '/api/admin/users', summary: 'Create a user (activation via emailed link in production)', tags: ['admin'], access: ['admin', 'owner'],
    body: z.object({
      email: z.string().email(), name: z.string().min(1),
      roles: z.array(RoleSchema).min(1), password: z.string().min(10),
      awardAuthority: z.boolean().default(false),
    }),
    handler: async ({ principal, body }) => db(ctx, principal!, async (c) => {
      const hash = await bcrypt.hash(body.password, 10);
      const r = await c.query(
        `INSERT INTO users (tenant_id, email, name, password_hash, roles, award_authority)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [principal!.tenantId, body.email, body.name, hash, body.roles, body.awardAuthority]);
      await audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: 'admin.user_create', objectRef: r.rows[0].id, payload: { email: body.email, roles: body.roles },
      });
      return { id: r.rows[0].id };
    }),
  });

  route(app, {
    method: 'PATCH', url: '/api/admin/users/:id', summary: 'Update roles / award authority / active', tags: ['admin'], access: ['admin', 'owner'],
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      roles: z.array(RoleSchema).min(1).optional(),
      awardAuthority: z.boolean().optional(),
      active: z.boolean().optional(),
    }),
    handler: async ({ principal, params, body }) => db(ctx, principal!, async (c) => {
      const cur = await c.query(`SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL`, [params.id]);
      if (!cur.rows.length) throw notFound('User not found');
      await c.query(
        `UPDATE users SET roles=coalesce($2, roles), award_authority=coalesce($3, award_authority), active=coalesce($4, active) WHERE id=$1`,
        [params.id, body.roles ?? null, body.awardAuthority ?? null, body.active ?? null]);
      await audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: 'admin.user_update', objectRef: params.id, payload: body,
      });
      return { ok: true };
    }),
  });

  route(app, {
    method: 'GET', url: '/api/admin/audit', summary: 'Audit log viewer (hash-chained, append-only)', tags: ['admin'], access: ['admin', 'owner', 'finance'],
    querystring: z.object({ limit: z.coerce.number().min(1).max(500).default(100), action: z.string().optional() }),
    handler: async ({ principal, query }) => db(ctx, principal!, async (c) => {
      const params: unknown[] = [query.limit];
      let where = 'true';
      if (query.action) { params.push(`${query.action}%`); where = `action LIKE $2`; }
      const r = await c.query(
        `SELECT id, ts, actor_name, channel, action, object_type, object_ref, payload, prev_hash, hash
         FROM audit_log WHERE ${where} ORDER BY id DESC LIMIT $1`, params);
      return {
        entries: r.rows.map((e) => ({
          id: Number(e.id), ts: e.ts, actorName: e.actor_name, channel: e.channel, action: e.action,
          objectType: e.object_type, objectRef: e.object_ref, payload: e.payload,
          prevHash: e.prev_hash, hash: e.hash,
        })),
      };
    }),
  });

  route(app, {
    method: 'GET', url: '/api/admin/model-registry', summary: 'Model registry (P5: add a model = add a row)', tags: ['admin'], access: ['admin', 'owner'],
    handler: async () => dbGlobal(ctx, async (c) => {
      const r = await c.query(`SELECT * FROM model_registry ORDER BY provider, model_id`);
      return {
        models: r.rows.map((m) => ({
          modelId: m.model_id, provider: m.provider, capabilities: m.capabilities,
          contextWindow: m.context_window, costInPerM: Number(m.cost_in_per_m),
          costOutPerM: Number(m.cost_out_per_m), status: m.status,
        })),
      };
    }),
  });

  route(app, {
    method: 'POST', url: '/api/admin/model-registry', summary: 'Register a model (canary → active → deprecated)', tags: ['admin'], access: ['admin', 'owner'],
    body: z.object({
      modelId: z.string().min(1), provider: z.string().min(1),
      capabilities: z.array(z.string()).default(['complete']),
      contextWindow: z.number().int().default(200000),
      costInPerM: z.number().default(0), costOutPerM: z.number().default(0),
      status: z.enum(['canary', 'active', 'deprecated']).default('canary'),
    }),
    handler: async ({ principal, body }) => {
      await dbGlobal(ctx, (c) => c.query(
        `INSERT INTO model_registry (model_id, provider, capabilities, context_window, cost_in_per_m, cost_out_per_m, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (model_id) DO UPDATE SET provider=$2, capabilities=$3, context_window=$4, cost_in_per_m=$5, cost_out_per_m=$6, status=$7`,
        [body.modelId, body.provider, JSON.stringify(body.capabilities), body.contextWindow, body.costInPerM, body.costOutPerM, body.status]));
      await db(ctx, principal!, (c) => audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: 'admin.model_registry_upsert', payload: body,
      }));
      return { ok: true };
    },
  });

  /** DSR export (GDPR): tenant-scoped data dump. */
  route(app, {
    method: 'GET', url: '/api/admin/export', summary: 'Tenant data export (DSR)', tags: ['admin'], access: ['admin', 'owner'],
    handler: async ({ principal }) => db(ctx, principal!, async (c) => {
      const grab = async (t: string) => (await c.query(`SELECT * FROM ${t}`)).rows;
      return {
        exportedAt: new Date().toISOString(),
        projects: await grab('projects'),
        shouldCostModels: await grab('should_cost_models'),
        procuraEvents: await grab('procura_events'),
        gates: await grab('gates'),
        spendNodes: await grab('spend_nodes'),
      };
    }),
  });
}
