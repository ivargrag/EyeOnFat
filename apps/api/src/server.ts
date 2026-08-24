/**
 * Fastify app assembly. Security defaults: CORS locked to the web origin,
 * security headers, rate limiting, zod validation at every edge (lib/route),
 * RLS-scoped DB access per request.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { ModelGateway } from '@eof/model-gw';
import { demoResolver } from '@eof/agents';
import { createPool } from '@eof/db';
import { loadEnv, type Env } from './env.js';
import { authPlugin } from './plugins/auth.js';
import type { AppCtx } from './lib/ctx.js';
import { dbGlobal } from './lib/ctx.js';
import { buildOpenApi } from './lib/route.js';
import { authRoutes } from './routes/auth.js';
import { projectRoutes } from './routes/projects.js';
import { gateRoutes } from './routes/gates.js';
import { shouldCostRoutes } from './routes/shouldcost.js';
import { ffgRoutes } from './routes/ffg.js';
import { procuraRoutes } from './routes/procura.js';
import { treeRoutes } from './routes/tree.js';
import { connectorRoutes } from './routes/connectors.js';
import { agentRoutes } from './routes/agents.js';
import { reportRoutes } from './routes/reports.js';
import { leverRoutes } from './routes/levers.js';
import { adminRoutes } from './routes/admin.js';

export interface BuiltServer {
  app: FastifyInstance;
  ctx: AppCtx;
}

export async function buildServer(envOverride?: Partial<Env>): Promise<BuiltServer> {
  const env = { ...loadEnv(), ...envOverride };
  const pool = createPool(env.DATABASE_URL);

  const ctx: AppCtx = {
    env, pool, boss: null,
    gateway: new ModelGateway({
      loadRegistry: async () =>
        dbGlobal({ env, pool, boss: null, gateway: null as never }, async (c) => {
          const r = await c.query(`SELECT * FROM model_registry`);
          return r.rows.map((m) => ({
            modelId: m.model_id, provider: m.provider,
            capabilities: m.capabilities ?? [], contextWindow: m.context_window,
            costInPerM: Number(m.cost_in_per_m), costOutPerM: Number(m.cost_out_per_m),
            status: m.status,
          }));
        }),
      demoResolver,
      defaultModel: env.MODEL_DEFAULT,
      onTelemetry: (t) => {
        if (env.NODE_ENV !== 'test') {
          console.log(`[model-gw] ${t.modelId} agent=${t.agent ?? '-'} in=${t.usage.inputTokens} out=${t.usage.outputTokens} $${t.costUsd.toFixed(5)} ${t.latencyMs}ms`);
        }
      },
    }),
  };

  const app = Fastify({ logger: env.NODE_ENV !== 'test', bodyLimit: 32 * 1024 * 1024 });

  await app.register(cors, { origin: [env.WEB_ORIGIN], credentials: true });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 256 * 1024 * 1024 } });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('strict-transport-security', 'max-age=63072000; includeSubDomains');
    reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
  });

  authPlugin(app, env);

  app.get('/api/health', async () => ({ ok: true, service: 'eyeonfat-api', ts: new Date().toISOString() }));

  authRoutes(app, ctx);
  connectorRoutes(app, ctx);
  treeRoutes(app, ctx);
  shouldCostRoutes(app, ctx);
  ffgRoutes(app, ctx);
  leverRoutes(app, ctx);
  projectRoutes(app, ctx);
  gateRoutes(app, ctx);
  procuraRoutes(app, ctx);
  agentRoutes(app, ctx);
  reportRoutes(app, ctx);
  adminRoutes(app, ctx);

  app.get('/api/openapi.json', async () => buildOpenApi());

  return { app, ctx };
}
