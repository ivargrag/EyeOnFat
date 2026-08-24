/**
 * Typed route helper: zod validation at every edge + OpenAPI collection.
 * Every registered route lands in ROUTE_REGISTRY, from which gen-openapi.ts
 * emits openapi.json (the client package is generated from that).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z, type ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Principal, Role } from '@eof/domain';
import { HttpError, forbidden, unauthorized } from './http-error.js';

export interface RouteDef<B extends ZodTypeAny, Q extends ZodTypeAny, P extends ZodTypeAny> {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  summary: string;
  tags?: string[];
  body?: B;
  querystring?: Q;
  params?: P;
  response?: ZodTypeAny;
  /** undefined → auth required (default). 'public' → no auth. Roles → auth + any-of roles. */
  access?: 'public' | Role[];
  handler: (ctx: {
    body: z.infer<B>;
    query: z.infer<Q>;
    params: z.infer<P>;
    principal: Principal | null;
    req: FastifyRequest;
    reply: FastifyReply;
  }) => Promise<unknown>;
}

export interface RegisteredRoute {
  method: string; url: string; summary: string; tags: string[];
  body?: ZodTypeAny; querystring?: ZodTypeAny; params?: ZodTypeAny; response?: ZodTypeAny;
  access: 'public' | Role[] | 'authenticated';
}

export const ROUTE_REGISTRY: RegisteredRoute[] = [];

export function route<B extends ZodTypeAny = ZodTypeAny, Q extends ZodTypeAny = ZodTypeAny, P extends ZodTypeAny = ZodTypeAny>(
  app: FastifyInstance,
  def: RouteDef<B, Q, P>,
): void {
  ROUTE_REGISTRY.push({
    method: def.method, url: def.url, summary: def.summary, tags: def.tags ?? [],
    body: def.body, querystring: def.querystring, params: def.params, response: def.response,
    access: def.access ?? 'authenticated',
  });

  app.route({
    method: def.method,
    url: def.url,
    handler: async (req, reply) => {
      try {
        const principal = (req as FastifyRequest & { principal?: Principal }).principal ?? null;
        if (def.access !== 'public') {
          if (!principal) throw unauthorized();
          if (Array.isArray(def.access) && !def.access.some((r) => principal.roles.includes(r))) {
            throw forbidden(`Requires one of roles: ${def.access.join(', ')}`, 'ROLE_REQUIRED');
          }
        }
        const parse = <T extends ZodTypeAny>(schema: T | undefined, value: unknown, part: string): z.infer<T> => {
          if (!schema) return value as z.infer<T>;
          const r = schema.safeParse(value ?? {});
          if (!r.success) throw new HttpError(400, `Invalid ${part}: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, 'VALIDATION');
          return r.data;
        };
        const out = await def.handler({
          body: parse(def.body, req.body, 'body'),
          query: parse(def.querystring, req.query, 'querystring'),
          params: parse(def.params, req.params, 'params'),
          principal,
          req, reply,
        });
        if (!reply.sent) reply.send(out ?? { ok: true });
      } catch (err) {
        if (err instanceof HttpError) {
          reply.status(err.statusCode).send({ error: err.message, code: err.code ?? 'ERROR' });
        } else {
          req.log.error(err);
          reply.status(500).send({ error: 'Internal error', code: 'INTERNAL' });
        }
      }
    },
  });
}

export function buildOpenApi(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of ROUTE_REGISTRY) {
    const url = r.url.replace(/:([A-Za-z_]+)/g, '{$1}');
    paths[url] ??= {};
    const op: Record<string, unknown> = {
      summary: r.summary,
      tags: r.tags,
      security: r.access === 'public' ? [] : [{ bearerAuth: [] }],
      responses: {
        '200': {
          description: 'OK',
          content: r.response
            ? { 'application/json': { schema: zodToJsonSchema(r.response, { $refStrategy: 'none' }) } }
            : undefined,
        },
      },
    };
    const params: unknown[] = [];
    if (r.params) {
      const s = zodToJsonSchema(r.params, { $refStrategy: 'none' }) as { properties?: Record<string, unknown>; required?: string[] };
      for (const [name, schema] of Object.entries(s.properties ?? {})) {
        params.push({ name, in: 'path', required: true, schema });
      }
    }
    if (r.querystring) {
      const s = zodToJsonSchema(r.querystring, { $refStrategy: 'none' }) as { properties?: Record<string, unknown>; required?: string[] };
      for (const [name, schema] of Object.entries(s.properties ?? {})) {
        params.push({ name, in: 'query', required: (s.required ?? []).includes(name), schema });
      }
    }
    if (params.length) op.parameters = params;
    if (r.body) {
      op.requestBody = {
        required: true,
        content: { 'application/json': { schema: zodToJsonSchema(r.body, { $refStrategy: 'none' }) } },
      };
    }
    paths[url][r.method.toLowerCase()] = op;
  }
  return {
    openapi: '3.0.3',
    info: { title: 'Eye on Fat API', version: '1.0.0', description: 'Cost Transformation SaaS · EMIRLabs.ai' },
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    paths,
  };
}
