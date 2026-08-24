# Deployment

## Recommended topology

| Component | Runtime | Why |
|---|---|---|
| `apps/web` | Vercel | Native Next.js deployment, CDN, previews |
| `apps/api` | Render, Railway, Fly.io, or AWS ECS | Long-running Fastify process and pg-boss worker |
| PostgreSQL | Managed PostgreSQL 16 | Durable data, RLS, audit chain, pg-boss |

The API currently starts a persistent pg-boss worker, schedules daily FX synchronization,
serves SSE streams, and accepts multipart uploads. Keep it on an always-on container rather
than converting it to short-lived serverless functions.

## 1. Provision PostgreSQL

Use a PostgreSQL 16 service that supports:

- TLS connections
- `pgcrypto`
- Role creation for the RLS-constrained `eof_app` role
- A transaction-compatible connection pooler
- Automated backups and point-in-time recovery

Run migrations from a trusted one-off job:

```bash
DATABASE_ADMIN_URL='<owner-url>' pnpm db:migrate
```

Seed only demo or staging environments:

```bash
DATABASE_ADMIN_URL='<owner-url>' pnpm db:seed
```

The API must use the non-owner `eof_app` connection through `DATABASE_URL` so forced RLS
remains effective.

## 2. Deploy the API

Build from the repository root:

```bash
docker build -f infra/api.Dockerfile -t eyeonfat-api .
```

Configure these API service variables:

```text
NODE_ENV=production
API_PORT=4000
WEB_ORIGIN=https://<vercel-production-domain>
DATABASE_URL=<eof_app pooled PostgreSQL URL>
JWT_ACCESS_SECRET=<random 32+ character secret>
JWT_REFRESH_SECRET=<different random 32+ character secret>
MODEL_DEFAULT=demo-engine
FX_SOURCE=seed
```

Optional live-model and FX variables:

```text
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
OPENEXCHANGERATES_APP_ID=
```

Expose port `4000` and configure the health check as `/api/health`. Keep at least one
instance running so pg-boss jobs continue to execute.

## 3. Deploy the web app to Vercel

1. Import the Git repository into Vercel.
2. Set **Root Directory** to `apps/web`.
3. Keep **Framework Preset** as Next.js.
4. Set `API_PROXY_TARGET=https://<public-api-domain>`.
5. Deploy.

`apps/web/vercel.json` runs the install and build from the workspace root. The Next.js
rewrite proxies browser `/api/*` requests to `API_PROXY_TARGET`, allowing the refresh-token
cookie to stay same-origin.

For Preview deployments, either use a stable staging API and include the preview origins in
the API CORS policy, or disable authenticated previews. The current API accepts one exact
`WEB_ORIGIN`.

## 4. Domain and release checks

- Point the application domain at the Vercel project.
- Set `WEB_ORIGIN` on the API to that exact HTTPS origin.
- Rotate all development passwords and JWT secrets.
- Require MFA for finance and admin roles.
- Run type checks, tests, the production web build, and Playwright acceptance tests.
- Verify login, token refresh, uploads, gate signing, COACH jobs, and Excel exports.
- Configure centralized logs, error reporting, uptime checks, and database backups.

## Production gaps

Before an enterprise launch, replace the development OCR and connector stubs, add direct
object-storage uploads, implement SSO and password recovery, use shared rate limiting, and
finish the AWS Terraform task definitions, load balancer, secrets, IAM, DNS, and alarms if
deploying on ECS.
