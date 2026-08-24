/**
 * Auth plugin — short-lived JWT access tokens, rotating refresh tokens.
 * The decoded principal is ALWAYS kind:'human'. No service/agent identity can
 * ever satisfy gate signing: agents have no login and no token issuance path.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { SignJWT, jwtVerify } from 'jose';
import type { Principal, Role } from '@eof/domain';
import type { Env } from '../env.js';

const enc = new TextEncoder();

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function issueAccessToken(env: Env, p: Omit<Principal, 'kind'>, scope: 'full' | 'mfa_setup' = 'full'): Promise<string> {
  return new SignJWT({ ...p, kind: 'human', scope })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL}s`)
    .setIssuer('eyeonfat')
    .sign(enc.encode(env.JWT_ACCESS_SECRET));
}

export async function verifyAccessToken(env: Env, token: string): Promise<(Principal & { scope: string }) | null> {
  try {
    const { payload } = await jwtVerify(token, enc.encode(env.JWT_ACCESS_SECRET), { issuer: 'eyeonfat' });
    if (payload.kind !== 'human') return null;
    return {
      userId: payload.userId as string,
      tenantId: payload.tenantId as string,
      name: payload.name as string,
      email: payload.email as string,
      roles: payload.roles as Role[],
      awardAuthority: Boolean(payload.awardAuthority),
      kind: 'human',
      scope: (payload.scope as string) ?? 'full',
    };
  } catch {
    return null;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
    tokenScope: string | null;
  }
}

export function authPlugin(app: FastifyInstance, env: Env): void {
  app.decorateRequest('principal', null);
  app.decorateRequest('tokenScope', null);
  app.addHook('onRequest', async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const p = await verifyAccessToken(env, header.slice(7));
      if (p && p.scope === 'full') {
        const { scope: _s, ...principal } = p;
        req.principal = principal;
        req.tokenScope = p.scope;
      } else if (p) {
        req.tokenScope = p.scope; // limited (mfa_setup) — principal stays null for normal routes
        (req as FastifyRequest & { limitedPrincipal?: Principal }).limitedPrincipal = (() => {
          const { scope: _x, ...principal } = p; return principal;
        })();
      }
    }
  });
}
