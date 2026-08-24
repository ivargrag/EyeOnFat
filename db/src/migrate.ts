/**
 * Migration runner. Applies db/migrations/*.sql in filename order, tracked in
 * _migrations. Runs against DATABASE_ADMIN_URL (owner role).
 * `--reset` drops and recreates the public schema first (dev only).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!adminUrl) {
  console.error('DATABASE_ADMIN_URL (or DATABASE_URL) is required');
  process.exit(1);
}

async function main() {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    if (process.argv.includes('--reset')) {
      if (process.env.NODE_ENV === 'production') throw new Error('Refusing --reset in production');
      console.log('⚠ resetting schema public');
      await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
      await client.query('DROP SCHEMA IF EXISTS pgboss CASCADE;');
    }
    await client.query(`CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const applied = new Set(
      (await client.query('SELECT name FROM _migrations')).rows.map((r: { name: string }) => r.name),
    );
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      if (applied.has(f)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
      console.log(`→ applying ${f}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [f]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${f} failed: ${(err as Error).message}`);
      }
    }
    console.log('✓ migrations up to date');
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
