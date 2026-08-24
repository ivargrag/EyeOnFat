# Eye on Fat — Product Requirements Document (PRD)

**Product:** Eye on Fat (EoF) — Cost Transformation SaaS
**Publisher:** EMIRLabs.ai
**Tagline:** Sustained Systemic Savings
**Version:** 1.0 · Status: Ready for implementation
**Audience:** Engineering (optimised for AI coding agents such as Claude Code), Security, DevOps, Design
**Reference prototype:** `Eye_on_Fat_SaaS_Portal_v3.html` (single-file interactive prototype — authoritative for UX layout, copy tone, and interaction patterns)

---

## 1. Product overview

### 1.1 What Eye on Fat is

Eye on Fat is a multi-tenant B2B SaaS platform that runs a structured, stage-gated cost transformation programme for small-to-medium enterprises. It combines:

1. **Spend Tree** — the entire company spend built as a drillable cube, every node split **Volume × Price** ("cost loses its anonymity"): category → supplier → invoice line, with analytics, insights, risk and opportunity flags.
2. **Should-Cost / Zero-Based Costing (ZBC)** — a clean-sheet engine that challenges the existence and the price of every spend line.
3. **Benchmarking** — against strategic look-alikes, industry look-alikes and internal peers.
4. **The seven-lever framework** — multiplicative levers (**Price × Specifications × Demand**) plus additive levers (**Eliminate + Automate/Digitise + Consolidate + Right Source**).
5. **Programme delivery** — ideation, stage-gated project management (Pipeline → Forecast → Committed), and management reporting across Teams, Departments, Brands, Business Units and Geographies.
6. **An agentic AI crew** — an orchestrator (COACH) plus specialist agents that automate analysis and drafting, with **hard human gates at every commercially consequential step**.
7. **Embedded procurement (Procura)** — projects on the Price, Specifications or Right Source levers, or needing a new supplier, convert into full procurement events run by the Procura Crew inside the project.

### 1.2 Product principles (non-negotiable)

| # | Principle | Implementation consequence |
|---|-----------|---------------------------|
| P1 | **Human-in-the-loop is absolute.** Agents surface, analyse, recommend — they never decide. The Crew never awards; COACH never signs a gate. | Every gate (G0–G6, Procura gates) requires an authenticated human signature persisted to an immutable audit log. No API path may advance a gated state without a user identity. |
| P2 | **Fair-margin floor is a supply-risk guardrail**, not a negotiation floor. | Bids/quotes modelling supplier margin below tenant-configured floor are flagged as risk and cannot be marked as "savings" without an explicit override + justification, logged. |
| P3 | **Fuel for Growth is a quality gate, not a formality.** Fat ≠ muscle ≠ bone. | G3 requires dual sign-off (Project Manager + accountable business Manager). Ideas cannot enter the lever pipeline without a green G3 decision. |
| P4 | **Sit on the side, not in the way.** No change-management exercise; EoF meets users inside Teams/Slack/e-mail/project tools. | Approvals, notifications, digests and quick actions are first-class in Teams and Slack; the web app is the deep-work surface, not the only surface. |
| P5 | **Model-agnostic AI.** Continuously upgradeable to newer models with zero product rewrites. | All LLM calls go through an internal Model Gateway with a provider-adapter pattern, model registry, evals and canary rollout. |
| P6 | **Grounding · Refusal · Auditability.** Agents cite provenance (source rows, indices with as-of dates), refuse when data is insufficient, and log every action. | Agent outputs are structured objects with `provenance[]`; analyst edits are a separate, never-overwritten layer. |
| P7 | **Directionally right beats falsely precise.** | All model outputs carry confidence bands and as-of dates; UI displays them. |

### 1.3 Goals / non-goals

**Goals (v1):** multi-tenant SaaS; the full six-stage value stream; agent crew with COACH semi-autonomy + Lever Council; embedded Procura events; Teams + Slack integration; multi-currency; reporting; SSO; SOC 2-ready security posture; ERP/accounting connectors (batch + API); Excel round-trip.

**Non-goals (v1):** supplier-facing bidding portal (Procura bid intake is via e-mail parsing + manual entry in v1; portal is v2); payments; contract lifecycle management; mobile native apps (responsive web + Teams/Slack mobile cover v1); on-prem deployment (single-tenant VPC deployment is a v1.5 option).

---

## 2. Users, tenancy, and roles

### 2.1 Personas

| Persona | Example | Primary jobs |
|---|---|---|
| **Programme Owner / CFO** | S. Iyer (Finance Lead) | Signs G0 scope, commits projects to Forecast (G5), owns SteerCo (G6) |
| **Category Lead / PM** | K. Menon | Creates projects, runs should-cost, signs G2/G3 (as PM), drives delivery |
| **Accountable business Manager** | Head of Retail Ops | Dual-signs G3, owns the P&L line affected |
| **Analyst** | — | Edits clean-sheets, drilldowns, prepares fact-bases |
| **Procurement Lead** | A. D'Souza | Runs Procura conversions, signs intake/RFP/award gates |
| **Tenant Admin** | — | Users, roles, SSO, connectors, currency/margin-floor config |
| **EMIRLabs Operator** (internal) | — | Tenant provisioning, model registry, platform health |

### 2.2 Tenancy model

- **Multi-tenant by default** (shared infra, strict row-level isolation). Tenant = one enterprise (e.g., Meridian Group).
- Org hierarchy inside a tenant: **Tenant → Business Unit (BU) → Country → Function/Department → Brand** (all filterable dimensions on every object).
- v1.5 option: dedicated single-tenant VPC deployment from the same codebase (env-driven).

### 2.3 RBAC (enforced server-side, mirrored in UI)

Roles: `owner`, `admin`, `finance`, `pm`, `manager`, `analyst`, `viewer`, `procurement`.
Key rules:
- Only `finance` can move a project Pipeline → Forecast (G5).
- G3 requires two distinct signatures with roles `pm` **and** `manager`.
- Procura award gate requires `procurement` or `manager` with award authority flag.
- All destructive actions are soft-delete + audit.

---

## 3. Domain model (canonical lexicon)

> Claude Code: implement these as the core Postgres schema + TypeScript domain types. Names below are canonical; do not rename.

- **SpendRecord**: tenant, source, supplier, category (8-level taxonomy), BU, country, function, brand, invoice ref, date, volume, unit_price, amount, currency, fx_rate_asof, lineage (document pointer).
- **SpendNode** (Spend Tree): materialised aggregate; `volume_share` + `price_share` drivers; LENS flags.
- **ShouldCostModel**: item, structure (cost elements), agent_layer (values + provenance + as-of), analyst_layer (edits, never overwritten), current_price, gap, sentinel_checks[], fair_margin_floor_pct, status (draft → G2-signed).
- **Idea/Project** (one object, stage-gated): name, dims (BU/country/function/brand/P&L element), **lever** ∈ {Price, Specifications, Demand, Eliminate, Automate, Consolidate, RightSource}, lead, team[], finance_lead, stage ∈ {Pipeline, Forecast, Committed, Delivered}, annual_savings, probability, savings_start/end, time_probability_adjusted (computed), carry_forward (computed), cost_to_achieve {one_time, recurring}, milestones[], meetings[] (with MoM attachments), classification ∈ {FAT, MUSCLE, BONE, null}, ffg_decision {verdict, tests[], evidence[], signatures[2]}, needs_new_supplier: bool, procura_event_id?, duplicated_from? ("steal with pride").
- **Gate**: id ∈ {G0..G6, P-INTAKE, P-RFP, P-AWARD}, object_ref, required_roles[], signatures[] {user, role, ts, decision, note}, status.
- **ProcuraEvent**: project_ref, should_cost_target, baseline, stage ∈ {intake, research, rfp_build, distribute_bids, evaluation, recommendation, award, complete}, crew_outputs {researcher, rfp_architect, bid_handler, recommender} (structured, per prototype output sections), evaluation_matrix (locked_at ts), bids[], award {decision, signer, ts}.
- **AgentRun**: agent, trigger (user|coach), inputs_ref, outputs_ref, model_used, tokens, cost, provenance[], status, gate_holds[].
- **LeverCouncilSession**: project_ref, participants[] (agent voices), transcript (structured stances + lever tags), consensus, dissent, recorded_by.
- **FYConfig**: fiscal year Apr–Mar (tenant-configurable), currency base USD, enabled currencies + live FX source.

**Gates:** G0 scope/completeness (CFO) · G1 opportunity shortlist · G2 clean-sheet acceptance (analyst) · G3 Fuel-for-Growth (dual) · G4 ideas sized & committed · G5 Finance commits to Forecast · G6 SteerCo signs actuals. Procura: intake ◆, RFP sign-off ◆, award ◆.

---

## 4. Functional requirements

Each requirement has an ID for traceability. **AC** = acceptance criteria (testable; write automated tests against them).

### 4.1 Module M1 — Authentication & shell
- **F1.1** Email+password with activation link, SSO (SAML 2.0 + OIDC: Entra ID, Google, Okta), MFA (TOTP) optional per tenant, enforced for `finance`/`admin`.
- **F1.2** App shell: beige sidebar with concentric-circles logo (black outer ring, red inner ring, black pupil) + tagline "Sustained Systemic Savings"; top bar with breadcrumb, **currency selector**, user menu. Navigation per prototype: Dashboard · Connectors & Data · Spend Tree · Should-Cost/ZBC · Fuel for Growth · 7 Levers & Sourcing · Projects · Add Project · Reports · Agent Crew · Admin.
- **F1.3 Multi-currency**: base USD; EUR, GBP, AED, SAR, INR minimum; daily FX (ECB/openexchangerates adapter) with rate as-of stamping; **every monetary figure in the app converts live**; stored values remain base currency.
  **AC:** switching currency re-renders all views < 300 ms without data refetch; round-trip USD→X→USD is lossless.

### 4.2 Module M2 — Connectors & data intake (Stage 00 · agent SCALE)
- **F2.1** Connectors (v1): SAP Business One, Tally, Zoho Books, QuickBooks Online, Xero, Odoo, NetSuite, Dynamics 365 BC, Coupa/Ariba (read), banking feeds (via aggregator adapter), **e-mail drop with OCR** (invoices@tenant… → parse PDF/scan to SpendRecord).
- **F2.2** File upload: XLSX/CSV/PDF/JSON/XML/ZIP; mapping wizard to the 8-level taxonomy; dedupe; trial-balance reconciliation; completeness meter (% of P&L classified; G0 target ≥ 95%).
- **F2.3** Sync detail per connector (rows/period, last sync, field mapping editor), error surfacing with re-auth flows.
  **AC:** a 150k-row GL file ingests, classifies ≥ 90% automatically, and appears in the Spend Tree within 5 minutes; every SpendRecord retains document lineage.

### 4.3 Module M3 — Spend Tree (Stage 01 · agents CUBE + LENS)
- **F3.1** Colored-block treemap (per prototype): block area ∝ spend; label, `$X.XM · Y% of spend`; bottom split bar **Volume driver share / Price driver share**; LENS flag chips (e.g., "price var 22%", "dup licences").
- **F3.2** Drill: category → suppliers (spend, insight, → Opportunity action) → invoice lines with lineage viewer.
- **F3.3** LENS analytics: price variance vs index, YoY driver decomposition (volume vs price), duplicate detection, tail-spend fragmentation, opportunity ranking (spend × volatility × savings potential) feeding G1.
  **AC:** driver split reconciles (volume_share + price_share = 100%); clicking → Opportunity pre-fills an Idea with dims and evidence attached.

### 4.4 Module M4 — Should-Cost / ZBC (Stage 02 · SCOPE, PULSE, FORGE, SENTINEL)
- **F4.1** ZBC challenge step ("should this spend exist?") precedes clean-sheet; outcome recorded.
- **F4.2** Clean-sheet builder: element stack, formula-driven; **agent layer** (values + index provenance + as-of) and **analyst layer** (edits) kept separate; live total, current price, gap.
- **F4.3** SENTINEL checks table (Check · Model · Benchmark · Status), look-alike benchmarking, **fair-margin floor** enforcement (P2).
- **F4.4** G2 signature freezes a version; frozen versions are the only ones referencable by negotiations/Procura.
  **AC:** analyst edit never mutates agent layer; SENTINEL blocks "savings" classification on sub-floor scenarios without override+reason.

### 4.5 Module M5 — Fuel for Growth (Stage 03 · agent FUEL FOR GROWTH · G3)
- **F5.1** Five tests, each scored 0–100 with expandable evidence: Customer experience · Quality & spec integrity · Growth capacity · Supply continuity · Brand, safety & compliance.
- **F5.2** Classification FAT / MUSCLE / BONE with agent verdict text + redesign proposal when MUSCLE/BONE (e.g., hours-cut → smart rostering).
- **F5.3** Decision Proceed / Hold-redesign / Reject; **dual signature** (PM + Manager); immutable audit entry; Hold routes to redesign workflow; Reject archives with reasoning.
  **AC:** API rejects a G3 decision with <2 distinct qualified signatures; UI shows signed state with timestamp.

### 4.6 Module M6 — Seven Levers & Sourcing (Stage 04 · agent LEVER)
- **F6.1** Seven lever cards (multiplicative/additive grouping) with tool lists, linked projects (jump-through), and per-lever totals.
- **F6.2** Sizing calculators per lever; negotiation talk-track / business-case drafting by LEVER agent.
- **F6.3** Procurement hand-off panel describing Procura conversion criteria (Price/Specs/Right Source/new supplier).

### 4.7 Module M7 — Projects & delivery (Stage 05 · PILOT + SCRIBE)
- **F7.1** Project table with filters (My/All, BU, Country, P&L, Stage, Lever), T&P-adjusted totals, Excel download, custom query.
- **F7.2** **Duplicate — "steal with pride"** (copy resets stage to Pipeline, links `duplicated_from`, supports cross-BU/country/FY reuse).
- **F7.3** Project detail, four sections (Details · Savings · Cost to achieve · Milestones & meetings); MoM attachments incl. mobile camera capture; Finance-only Forecast commit (G5).
- **F7.4** Time & probability adjustment: `annual × months_remaining_in_FY/12 × probability`; carry-forward auto-computed.
- **F7.5 COACH semi-autonomous run (in every project)**: COACH sequences the relevant agents end-to-end (SCALE → CUBE·LENS → SCOPE·PULSE·FORGE → SENTINEL → FUEL FOR GROWTH → Lever Council → LEVER → [Procura if eligible] → PILOT·SCRIBE), runs autonomously **between** gates, pauses ◆ at every human gate with "Sign & resume", live step tracker + streaming log.
- **F7.6 Lever Council** (LLM council): configurable agent voices (default: LEVER chair, PULSE, SENTINEL, FUEL FOR GROWTH, CUBE, The Recommender) debate which levers to push for this project; structured stances with lever tags; consensus + dissent recorded to audit; human decides.
  **AC:** killing the browser mid-COACH-run resumes from persisted state; no gate is ever auto-signed.

### 4.8 Module M8 — Embedded Procura events
- **F8.1** Eligibility: lever ∈ {Price, Specifications, Right Source} OR `needs_new_supplier`. Eligible projects show **Convert to Procurement project**; Add-Project flags eligibility at creation.
- **F8.2** Converted projects embed the **full Procura Crew UI** (per prototype/Procura Crew artifact): four agent cards — `Agent · 01 The Researcher`, `02 The RFP Architect`, `03 The Bid Handler`, `04 The Recommender` — with ghost numbers, missions, working tickers, Idle/Working/Complete pills, and expandable structured output sections (price band anchored to should-cost, evaluation matrix **locked at distribution**, TCO-normalised comparison, decision package).
- **F8.3** Stages: intake ◆ → research → rfp_build ◆ → distribute_bids → evaluation → recommendation ◆ (award) → complete; equal-information Q&A rule; bids sealed until deadline; SENTINEL sub-floor flags.
- **F8.4** Award writes back: contract summary + realised savings into the project; SCRIBE updates funnel.
  **AC:** RFP cannot be distributed without RFP-gate signature; award requires human signature; evaluation matrix immutable after lock.

### 4.9 Module M9 — Reports & SteerCo
- **F9.1** Dashboard: KPI row, monthly stacked bars Pipeline/Forecast/Committed **with $M totals above each month**, needs-attention list, Procura-linked projects panel.
- **F9.2** Reports: savings by BU (pie), by Country (pie), by P&L element (table), monthly phasing; Excel export; SteerCo PDF pack; saved custom queries.
- **F9.3** Zero-based budget hand-off: G6-signed actuals exportable as next-cycle budget baselines.

### 4.10 Module M10 — Admin
Tenant settings (FY, currencies, margin floor %, taxonomy editor), users/roles/SSO, connector credentials (vaulted), integration config (Teams/Slack/Jira…), audit log viewer, data export/erasure (DSR).

---

## 5. Agentic AI architecture

### 5.1 Agent roster (canonical)

| Agent | Stage | Mandate (summary) |
|---|---|---|
| **COACH** | Orchestrator | Sequences the crew per project; semi-autonomous between gates; chairs Lever Council; opens Procura events; never signs gates |
| SCALE | 00 | Ingest, dedupe, classify, reconcile |
| CUBE | 01 | Build Volume × Price cube |
| LENS | 01 | Anomalies, driver decomposition, opportunity ranking |
| SCOPE | 02 | ZBC question + cost structure |
| PULSE | 02 | Market pricing with indices, as-of dates |
| FORGE | 02 | Formula stack assembly; preserves analyst layer |
| SENTINEL | 02–03 | Benchmarks + fair-margin floor guardrail (merged MIRROR) |
| **FUEL FOR GROWTH** | 03 | Five tests, FAT/MUSCLE/BONE, redesign proposals (converged Trainer) |
| LEVER | 04 | Lever mapping, sizing, talk-tracks |
| PILOT | 05 | Milestones, blockers, escalation |
| SCRIBE | 05 | Funnel, phasing, SteerCo packs, playbook library |
| The Researcher | Procura | Market view, long-list, price band vs should-cost |
| The RFP Architect | Procura | RFP + locked evaluation matrix |
| The Bid Handler | Procura | Distribution, equal-info Q&A, sealed bids, TCO normalisation |
| The Recommender | Procura | Award memo + decision package (never awards) |

### 5.2 Model Gateway (P5 — upgradeability)

```
apps/api ──> ModelGateway ──> ProviderAdapter(Anthropic) ──> claude-*
                       │─────> ProviderAdapter(OpenAI)
                       │─────> ProviderAdapter(Bedrock/Vertex)
                       └─────> ProviderAdapter(Local/vLLM)
```

- **Adapter interface**: `complete()`, `stream()`, `toolCall()`, `embed()` — normalised request/response, tool-use schema translation per provider.
- **Model registry** (DB-backed): model id, provider, capabilities, context window, cost, status ∈ {canary, active, deprecated}; **per-agent model binding** configurable per tenant (e.g., FUEL FOR GROWTH on the strongest model, SCRIBE on a fast/cheap one).
- **Upgrade path**: add adapter/registry row → run eval suite (golden tasks per agent: classification accuracy, extraction fidelity, refusal behaviour) → canary on N% of AgentRuns → promote. Zero product-code change.
- **Prompt management**: versioned prompt templates per agent in repo (`packages/agents/prompts/*`), rendered with structured context; prompts are data, reviewed via PR.
- **MCP-native**: internal tools (spend queries, should-cost calc, benchmarks, Procura actions) exposed as MCP servers so any MCP-capable model/runtime can drive them; also consumable by customers' own agent stacks (read-only scopes).

### 5.3 Agent runtime & safety

- Durable orchestration (Temporal or equivalent): every AgentRun is a workflow with retries, timeouts, resumability (F7.5 AC).
- **Tool allow-lists per agent**; agents cannot call gate-signing mutations (enforced at API layer by role of the *human* principal only).
- **Grounding contract**: outputs must include `provenance[]`; renderer shows citations; missing grounding ⇒ agent must refuse ("insufficient data") rather than guess.
- **Prompt-injection defences**: all ingested content (invoices, supplier e-mails, bids) is untrusted; strip/neutralise instructions, never allow ingested text to trigger tools directly; human confirmation for any side-effect suggested by document content.
- Cost & token budgets per tenant/agent with alerts; full AgentRun telemetry.

---

## 6. Integrations — "sit on the side" (P4)

### 6.1 Microsoft Teams (first-class)
- **T1** Bot + message extension: notifications (gate pending, bid received, milestone slipping, COACH paused), **Adaptive Card approvals** for G3/G5/Procura gates — sign with reason **from Teams**, identity via Entra SSO mapped to EoF user; dual-sign flows collect both signatures.
- **T2** Tab app: Dashboard + My Projects + pending gates inside a Teams tab (SSO silent auth).
- **T3** Commands: `find project <x>`, `pipeline this month`, `convene council on <project>`; weekly SteerCo digest to a channel.
- **T4** Deep links from every card into the exact project/gate in the web app.

### 6.2 Slack (first-class)
- **S1** App with the same capability set: Block Kit approval messages with signature modal, `/eof` slash commands, per-BU channel digests, link unfurling of EoF URLs into rich previews.

### 6.3 Project & workflow tools
- **W1** Jira / Asana / Monday.com / Azure DevOps (adapter pattern): two-way milestone sync — EoF milestones can mirror to a board; status/done-ness flows back; mapping configured per tenant. EoF remains system of record for savings; PM tools remain the team's daily surface.
- **W2** E-mail: actionable gate e-mails (magic-link signature with step-up auth), MoM-by-e-mail into meetings, invoice drop.
- **W3** Calendar (M365/Google): milestone and SteerCo scheduling with deep links.
- **W4** Webhooks out (signed, HMAC) for every domain event; Zapier/Make connector built on the public API.

**Integration AC:** a Manager can complete a full G3 dual-sign entirely from Teams or Slack on mobile, and the audit log records channel of signature; no EoF login screen is ever required for approvals once SSO-linked.

---

## 7. System architecture

### 7.1 Stack (recommended; Claude Code may substitute equivalents only with parity)

- **Frontend:** Next.js (React 18, TypeScript), Tailwind + design tokens from the prototype (paper `#F4F6F1`, ink `#16211E`, tape `#FFC526`, fat `#E4572E`, lean `#1E8A5A`, beige sidebar `#EDE8DA`; fonts Barlow Condensed / IBM Plex Sans / IBM Plex Mono). Recharts/visx for charts; treemap per prototype format.
- **API:** Node.js (NestJS or Fastify, TypeScript), REST + typed SDK (OpenAPI-generated); GraphQL optional read layer.
- **DB:** PostgreSQL 15+ with **Row-Level Security keyed on tenant_id** (defence-in-depth on top of app scoping); pgvector for embeddings (benchmark/library search); read replicas for reporting.
- **Queue/Jobs:** Temporal (agent workflows, connector syncs) + Redis (cache, rate limits).
- **Storage:** S3-compatible object store (documents, MoM, exports) with per-tenant prefixes + SSE.
- **Search/OLAP:** DuckDB/ClickHouse for spend analytics at scale (≥ 10M rows/tenant).
- **Infra:** Docker → Kubernetes (or ECS); Terraform IaC; environments dev/staging/prod; CDN for static.
- **Observability:** OpenTelemetry traces, Prometheus/Grafana, structured logs (tenant-scoped), Sentry; per-agent cost dashboards.

### 7.2 Monorepo layout (for Claude Code)

```
eyeonfat/
  apps/web            # Next.js app (shell, all modules M1–M10)
  apps/api            # REST API, RBAC, gates, audit
  apps/integrations   # Teams bot, Slack app, webhook dispatcher, PM-tool adapters
  packages/domain     # TS domain types + zod schemas (Section 3 canonical)
  packages/agents     # agent definitions, prompts/, tools/, council, COACH graphs
  packages/model-gw   # ModelGateway + provider adapters + registry + evals/
  packages/connectors # ERP/accounting adapters + OCR pipeline
  packages/ui         # design system (tokens above), charts, treemap, crew cards
  infra/              # terraform, k8s manifests, CI/CD
  db/                 # migrations (Prisma/Drizzle), RLS policies, seeds (Meridian demo)
  e2e/                # Playwright suites per AC
```

### 7.3 Key flows (sequence summaries)
1. **Ingest:** connector/webhook/e-mail → SCALE workflow → SpendRecords → cube materialisation → LENS flags → G0 meter.
2. **COACH run:** user "Hand to COACH" → Temporal workflow instantiates agent graph for the project → streams steps via SSE/WebSocket → persists at each step → gate hold creates Gate row + Teams/Slack cards → human signature resumes workflow.
3. **Procura conversion:** eligibility check → event created with frozen should-cost ref → crew workflow (same runtime) → award signature → write-back.

---

## 8. Security & compliance (ready-to-deploy posture)

- **AuthN/Z:** OIDC/SAML SSO, MFA, short-lived JWT + rotating refresh, session revocation; RBAC server-side on every route; object-level checks + Postgres RLS.
- **Tenant isolation:** tenant_id on every row, RLS policies, per-tenant object-store prefixes, per-tenant encryption context.
- **Encryption:** TLS 1.2+ everywhere; AES-256 at rest (DB, objects, backups); field-level encryption for connector credentials and tokens via KMS-backed vault (AWS KMS/Hashicorp Vault); secrets never in env-committed files.
- **Audit:** append-only audit log (hash-chained) for gates, signatures, role changes, exports, agent side-effects; exportable for tenant auditors.
- **AppSec:** OWASP ASVS L2 target; input validation via zod at the edge; CSRF, CSP, HSTS, rate limiting, dependency scanning (SCA), SAST in CI, container image scanning, signed images; least-privilege IAM.
- **AI-specific:** prompt-injection controls (Section 5.3), PII minimisation in prompts, no training on tenant data, model I/O logging with tenant-controlled retention, jailbreak/refusal eval gates before model promotion.
- **Compliance runway:** SOC 2 Type II control mapping from day one (access reviews, change management, backup/restore drills); GDPR/DSR endpoints (export, erasure); data residency option (region pinning) v1.5.
- **Resilience:** RPO ≤ 1 h, RTO ≤ 4 h; daily encrypted backups + PITR; chaos-tested failover for API and workflows.

---

## 9. Non-functional requirements

| Area | Target |
|---|---|
| Performance | P95 API < 300 ms (reads), treemap render < 1 s at 10k nodes, currency re-render < 300 ms |
| Scale | 200 tenants, 50M SpendRecords aggregate, 500 concurrent users, 10k AgentRuns/day |
| Availability | 99.9% app; agent runs resumable across deploys |
| Accessibility | WCAG 2.1 AA (keyboard nav on treemap, cards, gates — as in prototype) |
| i18n | en v1; string externalisation from day one; RTL-ready layout |
| Browser | Evergreen Chrome/Edge/Safari/Firefox; responsive to 375 px |

---

## 10. Delivery plan (phased; each phase independently shippable)

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Foundation** | Monorepo, CI/CD, auth/SSO, tenancy+RLS, design system, audit log | Deploy to staging; login→shell E2E green |
| **1. Data & Tree** | M2 (upload + 3 connectors: SAP B1, QuickBooks, e-mail OCR), M3 | 150k-row ingest AC; treemap parity with prototype |
| **2. Analysis** | M4, M5 (with FUEL FOR GROWTH agent), Model Gateway + 2 providers | G2/G3 signature ACs; provider swap demo |
| **3. Pipeline** | M6, M7 incl. COACH + Lever Council, M9 dashboard | COACH resumability AC; Finance-only G5 AC |
| **4. Procura** | M8 full crew UI + workflows | RFP-lock + award-gate ACs |
| **5. Side-by-side** | Teams + Slack apps, webhooks, Jira adapter, M9 reports/exports, M10 admin | Teams/Slack dual-sign AC; SteerCo pack |
| **6. Hardening** | Pen test remediation, SOC 2 evidence, load tests, canary tooling | Prod go-live checklist signed |

---

## 11. Instructions to the implementing AI (Claude Code)

1. Treat **Section 3 names and Section 1.2 principles as invariants**; raise a question rather than silently deviating.
2. Build in the monorepo layout of §7.2; generate OpenAPI from route definitions and a typed client for the web app.
3. Use the prototype (`Eye_on_Fat_SaaS_Portal_v3.html`) as the **visual/interaction source of truth** for: sidebar/shell, spend-tree block format, should-cost stack + SENTINEL table, FFG tests/decision UI, lever cards, project table/detail accordions, COACH panel + council, embedded Procura crew cards, dashboard bars with $M totals, report pies.
4. Write Playwright tests for every **AC** in §4/§6 before marking a requirement done; seed the Meridian Group demo dataset (projects, spend, one live Procura event) for E2E.
5. Never implement any code path that advances a Gate without an authenticated human principal — including admin tooling and tests (use test users).
6. All LLM access exclusively via `packages/model-gw`; adding a model must require only registry data + adapter, no feature-code edits.
7. Deliver: `docker compose up` local dev, one-command staging deploy (Terraform), `SECURITY.md`, `RUNBOOK.md`, ERD, and API docs.

---

## 12. Open questions (flag before build)

1. FX source licensing (ECB free vs commercial feed) per tenant?
2. Procura supplier-facing portal timing (v2 assumption confirmed?).
3. Data-residency regions required at launch (UAE/KSA hosting)?
4. Which PM tool ships first in W1 (default assumption: Jira)?
5. Benchmark library seed data source and licensing.

---

*End of PRD v1.0 — Eye on Fat · EMIRLabs.ai · Sustained Systemic Savings*
