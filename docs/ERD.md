# Eye on Fat — Entity-Relationship Diagram

All tenant-scoped tables carry `tenant_id` with **forced Row-Level Security**
(`tenant_id = current_setting('app.tenant_id')`). Amounts are base USD.

```mermaid
erDiagram
    TENANTS ||--o{ USERS : has
    TENANTS ||--o{ SPEND_RECORDS : has
    TENANTS ||--o{ SPEND_NODES : has
    TENANTS ||--o{ SHOULD_COST_MODELS : has
    TENANTS ||--o{ PROJECTS : has
    TENANTS ||--o{ GATES : has
    TENANTS ||--o{ PROCURA_EVENTS : has
    TENANTS ||--o{ AGENT_RUNS : has
    TENANTS ||--o{ COUNCIL_SESSIONS : has
    TENANTS ||--o{ AUDIT_LOG : has
    TENANTS ||--o{ CONNECTORS : has
    TENANTS ||--o{ INTAKE_FILES : has

    USERS ||--o{ REFRESH_TOKENS : owns
    SPEND_NODES ||--o{ SPEND_NODES : "parent (category→supplier→invoice)"
    SPEND_RECORDS }o--|| SPEND_NODES : "aggregates into"
    PROJECTS ||--o| SHOULD_COST_MODELS : "fact-base (frozen at G2)"
    PROJECTS ||--o| PROCURA_EVENTS : "converts to (eligible levers)"
    PROJECTS ||--o{ GATES : "G3/G4/G5/G6"
    SHOULD_COST_MODELS ||--o{ GATES : "G2"
    PROCURA_EVENTS ||--o{ GATES : "P-INTAKE / P-RFP / P-AWARD"
    PROJECTS ||--o{ AGENT_RUNS : "COACH runs"
    PROCURA_EVENTS ||--o{ AGENT_RUNS : "crew runs"
    PROJECTS ||--o{ COUNCIL_SESSIONS : "Lever Council"
    PROJECTS ||--o{ PROJECTS : "duplicated_from (steal with pride)"

    TENANTS { uuid id PK; text slug UK; jsonb settings "FYConfig" }
    USERS { uuid id PK; uuid tenant_id FK; text email; text[] roles; bool mfa_enabled; bool award_authority }
    SPEND_RECORDS { uuid id PK; text supplier; text[] category "8-level"; date date; numeric amount_usd; jsonb lineage }
    SPEND_NODES { uuid id PK; uuid parent_id FK; text level; numeric amount_usd_k; numeric volume_share; numeric price_share; jsonb lens_flags }
    SHOULD_COST_MODELS { uuid id PK; jsonb zbc; jsonb structure "agent+analyst layers"; numeric current_price_usd; numeric fair_margin_floor_pct; jsonb sentinel_checks; text status; int frozen_version }
    PROJECTS { uuid id PK; text lever; text stage; numeric annual_savings_usd_k; numeric probability_pct; date savings_start; numeric tp_adjusted_usd_k; numeric carry_forward_usd_k; jsonb milestones; jsonb meetings; text classification; jsonb ffg_decision; bool needs_new_supplier; uuid procura_event_id; uuid duplicated_from }
    GATES { uuid id PK; text gate_id "G0..G6,P-*"; text object_type; uuid object_ref; text[] required_roles; int required_distinct; jsonb signatures; text status }
    PROCURA_EVENTS { uuid id PK; uuid project_ref FK; numeric should_cost_target_usd; text stage; jsonb crew_outputs; jsonb evaluation_matrix "lockedAt"; jsonb bids "sealed"; jsonb award; jsonb log }
    AGENT_RUNS { uuid id PK; text agent; text trigger; text status "queued..gate_hold..complete"; jsonb steps; jsonb outputs; jsonb provenance; text model_used; int tokens_in; int tokens_out }
    COUNCIL_SESSIONS { uuid id PK; uuid project_ref FK; jsonb participants; jsonb transcript; text consensus; text dissent; jsonb human_decision }
    AUDIT_LOG { bigint id PK; text action; text actor_name; jsonb payload; text prev_hash; text hash "sha256 chain" }
    FX_RATES { bigint id PK; text currency; numeric rate_per_usd; date as_of }
    MODEL_REGISTRY { uuid id PK; text model_id UK; text provider; text status "canary|active|deprecated" }
```

Global (no RLS): `tenants`, `fx_rates`, `model_registry`. Queue tables live in the
`pgboss` schema (durable workflow engine).
