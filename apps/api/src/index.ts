import { buildServer } from './server.js';
import { initWorkflows } from './services/workflows.js';
import { syncDailyRates } from './services/fx.js';

async function main() {
  const { app, ctx } = await buildServer();

  // Durable workflow engine (COACH runs, Procura crew) — Postgres-backed.
  try {
    ctx.boss = await initWorkflows(ctx);
  } catch (e) {
    app.log.warn(`Workflow engine unavailable (${(e as Error).message}) — COACH runs will queue when it returns.`);
  }

  // Daily FX sync (no-op with FX_SOURCE=seed).
  void syncDailyRates(ctx).catch(() => {});
  setInterval(() => { void syncDailyRates(ctx).catch(() => {}); }, 24 * 60 * 60 * 1000).unref();

  await app.listen({ port: ctx.env.API_PORT, host: '0.0.0.0' });
  app.log.info(`Eye on Fat API on :${ctx.env.API_PORT}`);

  const shutdown = async () => {
    await ctx.boss?.stop();
    await app.close();
    await ctx.pool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => { console.error(e); process.exit(1); });
