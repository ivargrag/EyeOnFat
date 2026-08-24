# RUNBOOK — Eye on Fat

## Services

| Service | Port | Health | Notes |
|---|---|---|---|
| web (Next.js) | 3000 | `/` | Proxies `/api/*` → API (same-origin cookies) |
| api (Fastify) | 4000 | `/api/health` | REST + OpenAPI at `/api/openapi.json` |
| db (Postgres 16) | 5432 | `pg_isready` | RLS on `tenant_id`; pg-boss schema `pgboss` |

The workflow engine (pg-boss) runs **in-process with the API**. Scale-out: run additional
API instances with the same `DATABASE_URL` — pg-boss coordinates via Postgres; COACH runs
are resumable because all state lives in `agent_runs.steps`.

## Local development

```bash
docker compose up --build        # everything, or:
pnpm dev                         # API + Web against your own Postgres
pnpm db:reset                    # drop + re-migrate + re-seed the demo tenant
pnpm gen:openapi                 # regenerate apps/api/openapi.json
pnpm --filter @eof/api-client gen  # regenerate client types from it
```

## Deploy (staging)

For the recommended Vercel web + container API topology, follow
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

For the AWS-only reference topology:

1. Build & push images: `docker build -f infra/api.Dockerfile -t <reg>/eof-api .`
   and `-f infra/web.Dockerfile -t <reg>/eof-web .`
2. `cd infra/terraform && terraform init && terraform apply -var-file=staging.tfvars`
   (RDS + ECS skeleton; wire the ALB per the comments in main.tf).
3. Run migrations as a one-off task: `node db/dist/migrate.js` with `DATABASE_ADMIN_URL`.
4. Secrets (JWT secrets, provider keys, DB passwords) come from SSM/Vault — never env files.

## Production checklist (change from dev defaults!)

- [ ] Rotate `eof_app` / `eof_owner` DB passwords (dev defaults live in `db/migrations/0000_roles.sql` and `.env.example`).
- [ ] Set strong `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (32+ chars, from vault).
- [ ] Tenant settings: `mfaRequiredForRoles: ["finance","admin"]` (demo tenant ships with `[]`).
- [ ] Configure SSO (OIDC/SAML) for the tenant; map Entra `oid` → user for Teams signing.
- [ ] `FX_SOURCE=openexchangerates` + `OPENEXCHANGERATES_APP_ID` for live daily FX.
- [ ] TLS termination at the ALB/ingress; the API already emits HSTS/CSP headers.
- [ ] Enable pgvector extension in RDS if benchmark-library search is used.
- [ ] Backups: PITR on; RPO ≤ 1h / RTO ≤ 4h drill per PRD §8.

## Operations

- **Re-seed demo tenant:** `pnpm db:seed` (idempotent — wipes and reloads Meridian only).
- **Audit chain verification:** every `audit_log` row's `hash = sha256(prev_hash | action | … )`;
  verify by walking `ORDER BY id` per tenant. UPDATE/DELETE are blocked by trigger.
- **Stuck COACH run:** runs pause at `status='gate_hold'` by design — sign the gate.
  A genuinely stuck run: `POST /api/agent-runs/:id/resume` re-enqueues from persisted state.
- **Model rollout (P5):** insert registry row with `status='canary'` → run agent evals →
  flip to `active`, demote old to `deprecated`. Zero code change.
- **Rotate a leaked refresh token:** `UPDATE refresh_tokens SET revoked=true WHERE user_id=…`.

## Known v1 scope notes

- Uploads accept CSV (XLSX → export CSV); PDF invoices arrive via the e-mail OCR drop
  (`packages/connectors` DevOcrEngine is the dev scaffold — swap for Textract/Azure DI in prod).
- Teams/Slack ship as adapter scaffolds — full bots need app registrations (see files).
- SteerCo pack renders print-ready HTML (browser → PDF); a server-side PDF renderer is a
  drop-in behind the same route.
