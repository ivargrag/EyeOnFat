/**
 * App context — shared singletons handed to routes/services.
 */
import type { Pool, PoolClient } from '@eof/db';
import { withTenant, withoutTenant } from '@eof/db';
import type { ModelGateway } from '@eof/model-gw';
import type PgBoss from 'pg-boss';
import type { Env } from '../env.js';
import type { Principal } from '@eof/domain';

export interface AppCtx {
  env: Env;
  pool: Pool;
  gateway: ModelGateway;
  boss: PgBoss | null;
}

/** Tenant-scoped DB access for a request principal (RLS pinned). */
export function db<T>(ctx: AppCtx, principal: Principal, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return withTenant(ctx.pool, principal.tenantId, fn);
}

/** Tenant-scoped access by raw tenant id (worker paths). */
export function dbTenant<T>(ctx: AppCtx, tenantId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return withTenant(ctx.pool, tenantId, fn);
}

export function dbGlobal<T>(ctx: AppCtx, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return withoutTenant(ctx.pool, fn);
}

export async function audit(
  c: PoolClient,
  args: {
    tenantId: string; actorId: string | null; actorName: string; channel?: string;
    action: string; objectType?: string; objectRef?: string; payload?: unknown;
  },
): Promise<void> {
  await c.query('SELECT audit_append($1,$2,$3,$4,$5,$6,$7,$8)', [
    args.tenantId, args.actorId, args.actorName, args.channel ?? 'web',
    args.action, args.objectType ?? null, args.objectRef ?? null,
    JSON.stringify(args.payload ?? {}),
  ]);
}
