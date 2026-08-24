/**
 * Shared DB access helpers. The API connects as the RLS-constrained app role
 * and runs every request inside withTenant(), which pins app.tenant_id for
 * the transaction — Postgres RLS then enforces isolation even if app code
 * forgets a WHERE tenant_id clause.
 */
import pg from 'pg';

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

export function createPool(connectionString?: string): pg.Pool {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  return new pg.Pool({ connectionString: url, max: 10 });
}

/** Run fn inside a transaction with RLS tenant context pinned. */
export async function withTenant<T>(
  pool: pg.Pool,
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // set_config with is_local=true scopes the setting to this transaction.
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Run fn without tenant context (auth lookups via SECURITY DEFINER fns only). */
export async function withoutTenant<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
