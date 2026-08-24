# SECURITY.md — Eye on Fat

Target posture: OWASP ASVS L2, SOC 2-ready (PRD §8).

## Authentication & sessions
- Email+password (bcrypt), TOTP MFA (otplib); enforcement per tenant via
  `settings.mfaRequiredForRoles` (recommended: `["finance","admin"]` — users get a
  limited `mfa_setup`-scope token until enrolled).
- Short-lived JWT access tokens (15 min, HS256, issuer-pinned) held in memory client-side;
  rotating refresh tokens (hashed at rest, revocable) in an httpOnly `SameSite=Lax` cookie
  scoped to `/api/auth`.
- SSO (OIDC/SAML — Entra, Google, Okta) mounts in `apps/api/src/routes/auth.ts`;
  Teams/Slack approvals map the channel identity to the SSO-linked user — bots never sign.

## Authorization
- RBAC server-side on every route (`access:` in the route table) + object checks.
- **Gates**: the only mutation path is `services/gates.ts::signGate`, which requires an
  authenticated *human* principal (verified against an active user row), eligible role,
  distinct signers, and (P-AWARD) the award-authority flag. Agents/services have no
  token-issuance path, so no agent can ever satisfy it.
- Postgres **Row-Level Security** on every tenant table (`FORCE ROW LEVEL SECURITY`),
  keyed on `app.tenant_id` set per transaction; the API connects as `eof_app`
  (NOSUPERUSER, NOBYPASSRLS, **no DELETE grants** — soft-delete only).

## Data protection
- All amounts stored base-USD; per-tenant isolation at row level; auth lookups run through
  narrow SECURITY DEFINER functions only.
- Audit log is append-only and hash-chained per tenant
  (`hash = sha256(prev_hash | action | object | payload | ts)`); UPDATE/DELETE blocked by trigger.
- Secrets via environment/vault; `.env` is git-ignored; dev defaults are documented and must
  be rotated (RUNBOOK checklist). Connector credentials are vault-key references, not values.
- TLS 1.2+ everywhere in deployment; AES-256 at rest via RDS/EBS encryption.

## AppSec controls in code
- zod validation at every edge (body/query/params) with typed 400s.
- Security headers (HSTS, CSP `default-src 'none'` on the API, nosniff, frame-deny),
  CORS locked to the web origin, rate limiting (600 req/min/IP), 32 MB body cap.
- SQL exclusively via parameterised queries.

## AI-specific safety (PRD §5.3)
- **Grounding contract**: agent outputs must carry `provenance[]`; ungrounded output is
  converted to a refusal by the runner — agents never guess.
- **Prompt injection**: ingested content (invoices, bids, supplier e-mails, OCR text) is
  untrusted; `neutraliseUntrusted()` defangs instruction patterns and fences the content;
  document content can never trigger tools without human confirmation.
- **Tool allow-lists** per agent (roster); gate-signing is not a tool any agent has.
- Sealed bids are redacted server-side until the deadline — agents see `sealed: true` only.
- Per-call token/cost telemetry (`model-gw` onTelemetry → agent_runs); no tenant data used
  for model training; PII minimised in prompts (context objects carry business fields only).

## Reporting a vulnerability
Email security@emirlabs.ai. Please include reproduction steps; we target 72h triage.
