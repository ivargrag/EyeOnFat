# Eye on Fat — Cost Transformation SaaS

**Publisher:** EMIRLabs.ai · **Tagline:** Sustained Systemic Savings · **Version:** 1.0

Multi-tenant B2B SaaS running a structured, stage-gated cost transformation programme:
Spend Tree (Volume × Price cube) → Should-Cost/ZBC → Fuel-for-Growth gate → seven-lever
opportunity engine → project delivery & reporting — automated by an agent crew
(COACH + specialists + the Procura Crew) with **hard human gates at every commercially
consequential step**. Agents recommend; humans decide.

## Quick start (Docker)

```bash
cp .env.example .env          # defaults work for local dev
docker compose up --build
```

- Web: http://localhost:3000 · API: http://localhost:4000/api/health
- Postgres, migrations and the **Meridian Group demo tenant** seed automatically.

**Demo logins** (password for all: `EyeOnFat!2026`)

| User | Roles | Use for |
|---|---|---|
| k.menon@meridiangroup.com | pm, analyst | Projects, clean-sheets, G2/G3 (pm slot) |
| retail.ops@meridiangroup.com | manager | G3 dual-sign (manager slot) |
| s.iyer@meridiangroup.com | finance | G5 — commit Pipeline → Forecast |
| a.dsouza@meridiangroup.com | procurement, pm (award authority) | Procura gates & award |
| sc.director@meridiangroup.com | manager (award authority) | Procura award |
| admin@meridiangroup.com | owner, admin | Admin, audit log, model registry |
| p.rao@meridiangroup.com | pm | Second pm (negative-path testing) |

## Quick start (bare metal)

```bash
pnpm install
pnpm --filter @eof/domain build && pnpm --filter @eof/model-gw build \
  && pnpm --filter @eof/agents build && pnpm --filter @eof/db build
cp .env.example .env                       # point DATABASE_URL at Postgres 15+
pnpm db:migrate && pnpm db:seed
pnpm dev                                   # API :4000 + Web :3000
```

## LLM configuration

All model calls go through `packages/model-gw` (invariant: no provider SDKs anywhere else).

- **No keys set** → the deterministic **demo engine** runs every agent (COACH runs,
  Lever Council, Procura crew) with grounded, prototype-matching outputs. Fully demoable offline.
- Set `ANTHROPIC_API_KEY` (and/or `OPENAI_API_KEY`) + `MODEL_DEFAULT=claude-sonnet-4-5`
  → agents run live. Adding a model = one row in `model_registry` (Admin → Model registry);
  adding a provider = one adapter in `packages/model-gw/src/adapters/`.

## Repo layout (PRD §7.2)

```
apps/web            Next.js 16 shell + all modules M1–M10 (prototype-parity UI)
apps/api            Fastify REST API — RBAC, gates, audit, OpenAPI at /api/openapi.json
apps/integrations   Teams/Slack/webhook/Jira adapters ("sit on the side", P4)
packages/domain     Canonical types + zod schemas (PRD §3) + gate rulebook + FY math
packages/agents     Agent roster, versioned prompts/, COACH graph, council, demo corpus
packages/model-gw   ModelGateway + Anthropic/OpenAI/demo adapters + registry contract
packages/connectors ERP adapter contract + OCR pipeline scaffold
packages/api-client Typed client (the only fetch layer; regen types via gen:openapi)
packages/ui         Design tokens (from the reference prototype)
db/                 SQL migrations (incl. RLS policies), Meridian seed
e2e/                Playwright suites keyed to PRD acceptance criteria
infra/              Dockerfiles, Terraform skeleton
docs/               PRD + reference prototype + ERD
```

## Invariants (enforced in code — see CLAUDE.md)

1. No code path advances a Gate without an authenticated human principal
   (`apps/api/src/services/gates.ts` — the only gate mutation path).
2. Agents recommend; humans decide. The Crew never awards; COACH never signs.
3. G3 requires two distinct signatures: role `pm` + role `manager`.
4. Only role `finance` moves a project Pipeline → Forecast (G5).
5. Fair-margin floor: sub-floor scenarios are supply risk — blocked from "savings"
   without an explicit override + reason (audited).
6. Analyst layer never overwritten by the agent layer in should-cost models.
7. All LLM calls via `packages/model-gw`.
8. Every agent output carries `provenance[]`; ungrounded output becomes a refusal.
9. Ingested content is untrusted — neutralised before agents see it.
10. Canonical domain names per PRD §3; append-only hash-chained audit log; soft-delete only.

## Deployment

The recommended production topology keeps the browser application on Vercel and the
stateful API/worker in a container:

- **Web:** Vercel project with **Root Directory** `apps/web`
- **API + pg-boss worker:** Render, Railway, Fly.io, or AWS ECS using `infra/api.Dockerfile`
- **Database:** managed PostgreSQL 16 with RLS, `pgcrypto`, and connection pooling

`apps/web/vercel.json` installs the pnpm workspace and builds the web app plus its
workspace dependencies. Set `API_PROXY_TARGET` on Vercel to the public API origin so
browser requests remain same-origin under `/api/*`.

Do not put database credentials, JWT secrets, or model-provider keys in the Vercel web
project. They belong only on the API service. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
for the complete deployment sequence and environment-variable checklist.

## Tests

```bash
pnpm --filter @eof/domain test    # 96 unit tests: every role × every gate, T&P math
DATABASE_URL=... pnpm --filter @eof/api test   # 14 integration tests vs seeded DB
pnpm e2e                          # Playwright suites keyed to PRD ACs (see e2e/README)
```

More: `RUNBOOK.md` (operate), `docs/DEPLOYMENT.md` (deploy), `SECURITY.md` (posture),
`docs/ERD.md` (schema).
