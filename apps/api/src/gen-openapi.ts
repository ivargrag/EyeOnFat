/**
 * Emit openapi.json from the route registry (no server needed — building the
 * app registers all routes). The typed client in packages/api-client is
 * regenerated from this file: `pnpm gen:openapi && pnpm --filter @eof/api-client gen`.
 */
import { writeFileSync } from 'node:fs';
import { buildServer } from './server.js';
import { buildOpenApi } from './lib/route.js';

process.env.DATABASE_URL ??= 'postgres://placeholder:placeholder@localhost:5432/placeholder';
process.env.JWT_ACCESS_SECRET ??= 'openapi-generation-placeholder-secret!!';
process.env.JWT_REFRESH_SECRET ??= 'openapi-generation-placeholder-secret!!';

const { app, ctx } = await buildServer({ NODE_ENV: 'test' } as never);
const spec = buildOpenApi();
writeFileSync(new URL('../openapi.json', import.meta.url), JSON.stringify(spec, null, 2));
console.log(`openapi.json written (${Object.keys((spec as { paths: object }).paths).length} paths)`);
await app.close();
await ctx.pool.end();
process.exit(0);
