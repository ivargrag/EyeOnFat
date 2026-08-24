/**
 * M1 — Authentication. Email+password (+ TOTP when enrolled), short-lived JWT
 * access token + rotating refresh cookie. MFA is ENFORCED for finance/admin:
 * those users receive a limited `mfa_setup` token until they enrol.
 * SSO (OIDC/SAML) mounts here in production — see SECURITY.md.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { z } from 'zod';
import { route } from '../lib/route.js';
import { dbGlobal, dbTenant, audit, type AppCtx } from '../lib/ctx.js';
import { issueAccessToken, verifyAccessToken } from '../plugins/auth.js';
import { badRequest, unauthorized } from '../lib/http-error.js';
import type { Principal, Role } from '@eof/domain';

const REFRESH_COOKIE = 'eof_refresh';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** MFA enforcement is tenant-configurable (settings.mfaRequiredForRoles); recommended production value: ['finance','admin']. */
const enforcedRoles = (settings: unknown): Role[] =>
  (((settings as { mfaRequiredForRoles?: Role[] })?.mfaRequiredForRoles) ?? []);

export function authRoutes(app: FastifyInstance, ctx: AppCtx): void {
  const setRefreshCookie = async (reply: { setCookie: Function }, tenantId: string, userId: string) => {
    const token = randomBytes(32).toString('hex');
    await dbTenant(ctx, tenantId, (c) => c.query(
      `INSERT INTO refresh_tokens (tenant_id, user_id, token_hash, expires_at)
       VALUES ($1,$2,$3, now() + ($4 || ' seconds')::interval)`,
      [tenantId, userId, sha256(token), String(ctx.env.REFRESH_TOKEN_TTL)]));
    reply.setCookie(REFRESH_COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: ctx.env.NODE_ENV === 'production',
      path: '/api/auth', maxAge: ctx.env.REFRESH_TOKEN_TTL,
    });
  };

  route(app, {
    method: 'POST', url: '/api/auth/login', summary: 'Login with email + password (+ TOTP when enrolled)',
    tags: ['auth'], access: 'public',
    body: z.object({ email: z.string().email(), password: z.string().min(1), totp: z.string().optional() }),
    handler: async ({ body, reply, req }) => {
      const user = await dbGlobal(ctx, async (c) => {
        const r = await c.query(`SELECT * FROM auth_user_by_email($1)`, [body.email]);
        return r.rows[0] ?? null;
      });
      if (!user || !user.active || !user.password_hash) throw unauthorized('Invalid credentials');
      const ok = await bcrypt.compare(body.password, user.password_hash);
      if (!ok) throw unauthorized('Invalid credentials');

      if (user.mfa_enabled) {
        if (!body.totp) return reply.send({ mfaRequired: true });
        if (!authenticator.verify({ token: body.totp, secret: user.mfa_secret })) {
          throw unauthorized('Invalid TOTP code');
        }
      }

      const principal: Omit<Principal, 'kind'> = {
        userId: user.id, tenantId: user.tenant_id, name: user.name, email: user.email,
        roles: user.roles, awardAuthority: user.award_authority,
      };

      const tenant = await dbGlobal(ctx, async (c) => (await c.query(
        `SELECT slug, name, settings FROM tenants WHERE id=$1`, [user.tenant_id])).rows[0]);

      // MFA enforcement (F1.1) — tenant-configured roles must enrol before full access.
      const mustEnrol = !user.mfa_enabled && user.roles.some((r: Role) => enforcedRoles(tenant.settings).includes(r));
      const scope = mustEnrol ? 'mfa_setup' : 'full';
      const accessToken = await issueAccessToken(ctx.env, principal, scope);
      await setRefreshCookie(reply as never, user.tenant_id, user.id);

      await dbTenant(ctx, user.tenant_id, (c) => audit(c, {
        tenantId: user.tenant_id, actorId: user.id, actorName: user.name,
        action: 'auth.login', payload: { scope },
      }));

      return reply.send({
        accessToken, mfaSetupRequired: mustEnrol,
        user: { id: user.id, name: user.name, email: user.email, roles: user.roles, awardAuthority: user.award_authority },
        tenant: { slug: tenant.slug, name: tenant.name, settings: tenant.settings },
        expiresIn: ctx.env.ACCESS_TOKEN_TTL,
      });
    },
  });

  route(app, {
    method: 'POST', url: '/api/auth/refresh', summary: 'Rotate refresh token, mint a new access token',
    tags: ['auth'], access: 'public',
    handler: async ({ req, reply }) => {
      const raw = (req.cookies ?? {})[REFRESH_COOKIE];
      if (!raw) throw unauthorized('No refresh token');
      const found = await dbGlobal(ctx, async (c) =>
        (await c.query(`SELECT * FROM auth_refresh_lookup($1)`, [sha256(raw)])).rows[0] ?? null);
      if (!found || found.revoked || new Date(found.expires_at) < new Date()) throw unauthorized('Refresh token expired');

      const user = await dbTenant(ctx, found.tenant_id, async (c) =>
        (await c.query(`SELECT * FROM users WHERE id=$1 AND active AND deleted_at IS NULL`, [found.user_id])).rows[0] ?? null);
      if (!user) throw unauthorized('User inactive');

      await dbTenant(ctx, found.tenant_id, (c) =>
        c.query(`UPDATE refresh_tokens SET revoked=true WHERE id=$1`, [found.id]));
      await setRefreshCookie(reply as never, found.tenant_id, found.user_id);

      const tenant = await dbGlobal(ctx, async (c) => (await c.query(
        `SELECT settings FROM tenants WHERE id=$1`, [found.tenant_id])).rows[0]);
      const mustEnrol = !user.mfa_enabled && (user.roles as Role[]).some((r) => enforcedRoles(tenant.settings).includes(r));
      const accessToken = await issueAccessToken(ctx.env, {
        userId: user.id, tenantId: user.tenant_id, name: user.name, email: user.email,
        roles: user.roles, awardAuthority: user.award_authority,
      }, mustEnrol ? 'mfa_setup' : 'full');
      return reply.send({ accessToken, expiresIn: ctx.env.ACCESS_TOKEN_TTL, mfaSetupRequired: mustEnrol });
    },
  });

  route(app, {
    method: 'POST', url: '/api/auth/logout', summary: 'Revoke refresh token', tags: ['auth'], access: 'public',
    handler: async ({ req, reply }) => {
      const raw = (req.cookies ?? {})[REFRESH_COOKIE];
      if (raw) {
        const found = await dbGlobal(ctx, async (c) =>
          (await c.query(`SELECT * FROM auth_refresh_lookup($1)`, [sha256(raw)])).rows[0] ?? null);
        if (found) {
          await dbTenant(ctx, found.tenant_id, (c) =>
            c.query(`UPDATE refresh_tokens SET revoked=true WHERE id=$1`, [found.id]));
        }
      }
      reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
      return reply.send({ ok: true });
    },
  });

  route(app, {
    method: 'GET', url: '/api/auth/me', summary: 'Current principal', tags: ['auth'],
    handler: async ({ principal }) => {
      const tenant = await dbGlobal(ctx, async (c) => (await c.query(
        `SELECT slug, name, settings FROM tenants WHERE id=$1`, [principal!.tenantId])).rows[0]);
      return { user: principal, tenant };
    },
  });

  // MFA enrolment — accessible with the limited mfa_setup scope too.
  app.post('/api/auth/mfa/setup', async (req, reply) => {
    const header = req.headers.authorization;
    const p = header?.startsWith('Bearer ') ? await verifyAccessToken(ctx.env, header.slice(7)) : null;
    if (!p) return reply.status(401).send({ error: 'Unauthorized' });
    const secret = authenticator.generateSecret();
    await dbTenant(ctx, p.tenantId, (c) =>
      c.query(`UPDATE users SET mfa_secret=$2 WHERE id=$1`, [p.userId, secret]));
    return reply.send({
      secret,
      otpauthUrl: authenticator.keyuri(p.email, 'Eye on Fat', secret),
    });
  });

  app.post('/api/auth/mfa/verify', async (req, reply) => {
    const header = req.headers.authorization;
    const p = header?.startsWith('Bearer ') ? await verifyAccessToken(ctx.env, header.slice(7)) : null;
    if (!p) return reply.status(401).send({ error: 'Unauthorized' });
    const body = z.object({ totp: z.string().min(6) }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'totp required' });
    const row = await dbTenant(ctx, p.tenantId, async (c) =>
      (await c.query(`SELECT mfa_secret FROM users WHERE id=$1`, [p.userId])).rows[0]);
    if (!row?.mfa_secret || !authenticator.verify({ token: body.data.totp, secret: row.mfa_secret })) {
      return reply.status(400).send({ error: 'Invalid TOTP code' });
    }
    await dbTenant(ctx, p.tenantId, async (c) => {
      await c.query(`UPDATE users SET mfa_enabled=true WHERE id=$1`, [p.userId]);
      await audit(c, { tenantId: p.tenantId, actorId: p.userId, actorName: p.name, action: 'auth.mfa.enabled' });
    });
    const accessToken = await issueAccessToken(ctx.env, {
      userId: p.userId, tenantId: p.tenantId, name: p.name, email: p.email,
      roles: p.roles, awardAuthority: p.awardAuthority,
    }, 'full');
    return reply.send({ ok: true, accessToken });
  });
}
