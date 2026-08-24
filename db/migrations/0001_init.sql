-- Eye on Fat — core schema. All amounts stored in base USD.
-- Every tenant-scoped table carries tenant_id (RLS in 0002_rls.sql).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- pgvector is optional in dev; enabled when the image provides it.
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector not available — embeddings disabled in this environment';
END $$;

-- ── Global tables ────────────────────────────────────────────────────────
CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- FYConfig
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE TABLE fx_rates (
  id           bigserial PRIMARY KEY,
  currency     text NOT NULL,
  rate_per_usd numeric(18,8) NOT NULL,
  as_of        date NOT NULL,
  source       text NOT NULL DEFAULT 'seed',
  UNIQUE (currency, as_of)
);

CREATE TABLE model_registry (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id       text NOT NULL UNIQUE,
  provider       text NOT NULL,             -- anthropic | openai | bedrock | vertex | local | demo
  capabilities   jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_window integer NOT NULL DEFAULT 200000,
  cost_in_per_m  numeric(10,4) NOT NULL DEFAULT 0,
  cost_out_per_m numeric(10,4) NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'active'   -- canary | active | deprecated
    CHECK (status IN ('canary','active','deprecated'))
);

-- ── Tenant-scoped tables ─────────────────────────────────────────────────
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  email           text NOT NULL,
  name            text NOT NULL,
  password_hash   text,
  roles           text[] NOT NULL DEFAULT '{viewer}',
  mfa_enabled     boolean NOT NULL DEFAULT false,
  mfa_secret      text,
  award_authority boolean NOT NULL DEFAULT false,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (tenant_id, email)
);

CREATE TABLE refresh_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON refresh_tokens (token_hash);

CREATE TABLE connectors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  key        text NOT NULL,            -- sap_b1, tally, zoho, qbo, xero, odoo, netsuite, d365bc, coupa, banking, email_ocr
  name       text NOT NULL,
  status     text NOT NULL DEFAULT 'not_connected',  -- ok | amber | red | not_connected
  status_line text NOT NULL DEFAULT '',
  detail     text NOT NULL DEFAULT '',
  config     jsonb NOT NULL DEFAULT '{}'::jsonb,     -- credentials live in the vault, referenced by key
  last_sync  timestamptz,
  UNIQUE (tenant_id, key)
);

CREATE TABLE intake_files (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  name       text NOT NULL,
  rows       integer NOT NULL DEFAULT 0,
  status     text NOT NULL DEFAULT 'queued',  -- queued | parsing | classified | error
  mapped_pct numeric(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE spend_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  source       text NOT NULL,
  supplier     text NOT NULL,
  category     text[] NOT NULL DEFAULT '{}',   -- 8-level taxonomy path
  bu           text NOT NULL DEFAULT '',
  country      text NOT NULL DEFAULT '',
  fn           text,
  brand        text,
  invoice_ref  text,
  date         date NOT NULL,
  volume       numeric(18,4),
  unit_price   numeric(18,6),
  amount_usd   numeric(18,2) NOT NULL,
  currency     text NOT NULL DEFAULT 'USD',
  fx_rate_asof date,
  lineage      jsonb,
  deleted_at   timestamptz
);
CREATE INDEX ON spend_records (tenant_id, supplier);
CREATE INDEX ON spend_records (tenant_id, date);
CREATE INDEX ON spend_records USING gin (category);

CREATE TABLE spend_nodes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  parent_id        uuid REFERENCES spend_nodes(id),
  level            text NOT NULL CHECK (level IN ('category','supplier','invoice')),
  name             text NOT NULL,
  amount_usd_k     numeric(18,1) NOT NULL DEFAULT 0,
  volume_share     numeric(5,2) NOT NULL DEFAULT 50,
  price_share      numeric(5,2) NOT NULL DEFAULT 50,
  lens_flags       jsonb NOT NULL DEFAULT '[]'::jsonb,
  insight          text,
  opportunity_rank numeric(10,2),
  record_count     integer NOT NULL DEFAULT 0,
  CHECK (volume_share + price_share = 100)
);
CREATE INDEX ON spend_nodes (tenant_id, parent_id);

CREATE TABLE should_cost_models (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  item                  text NOT NULL,
  unit                  text NOT NULL DEFAULT '',
  zbc                   jsonb NOT NULL DEFAULT '{"question":"Should this spend exist at all?","outcome":"pending","rationale":null}'::jsonb,
  structure             jsonb NOT NULL DEFAULT '[]'::jsonb,   -- CostElement[]: agent layer + analyst layer, both persisted
  current_price_usd     numeric(18,4) NOT NULL DEFAULT 0,
  fair_margin_floor_pct numeric(5,2) NOT NULL DEFAULT 8,
  sentinel_checks       jsonb NOT NULL DEFAULT '[]'::jsonb,
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','g2_signed')),
  frozen_version        integer,
  project_id            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

CREATE TABLE projects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  name             text NOT NULL,
  description      text NOT NULL DEFAULT '',
  bu               text NOT NULL,
  country          text NOT NULL,
  fn               text,
  brand            text,
  pnl_element      text NOT NULL,
  lever            text NOT NULL CHECK (lever IN ('Price','Specifications','Demand','Eliminate','Automate','Consolidate','RightSource')),
  lead_id          uuid REFERENCES users(id),
  lead_name        text NOT NULL DEFAULT '',
  team             jsonb NOT NULL DEFAULT '[]'::jsonb,
  finance_lead_id  uuid REFERENCES users(id),
  finance_lead_name text NOT NULL DEFAULT '',
  stage            text NOT NULL DEFAULT 'Pipeline' CHECK (stage IN ('Pipeline','Forecast','Committed','Delivered')),
  annual_savings_usd_k numeric(18,1) NOT NULL DEFAULT 0,
  probability_pct  numeric(5,2) NOT NULL DEFAULT 50,
  savings_start    date NOT NULL,
  savings_end      date,
  tp_adjusted_usd_k numeric(18,1) NOT NULL DEFAULT 0,
  carry_forward_usd_k numeric(18,1) NOT NULL DEFAULT 0,
  cost_to_achieve  jsonb NOT NULL DEFAULT '{"oneTimeUsdK":0,"recurringUsdK":0,"notes":null}'::jsonb,
  milestones       jsonb NOT NULL DEFAULT '[]'::jsonb,
  meetings         jsonb NOT NULL DEFAULT '[]'::jsonb,
  classification   text CHECK (classification IN ('FAT','MUSCLE','BONE')),
  ffg_decision     jsonb,
  needs_new_supplier boolean NOT NULL DEFAULT false,
  procura_event_id uuid,
  duplicated_from  uuid,
  should_cost_model_id uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX ON projects (tenant_id, stage);
CREATE INDEX ON projects (tenant_id, lever);

CREATE TABLE gates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  gate_id        text NOT NULL CHECK (gate_id IN ('G0','G1','G2','G3','G4','G5','G6','P-INTAKE','P-RFP','P-AWARD')),
  object_type    text NOT NULL CHECK (object_type IN ('tenant','project','should_cost_model','procura_event','spend_base')),
  object_ref     uuid NOT NULL,
  required_roles text[] NOT NULL,
  required_distinct integer NOT NULL DEFAULT 1,
  signatures     jsonb NOT NULL DEFAULT '[]'::jsonb,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open','signed','rejected','held')),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON gates (tenant_id, object_ref);

CREATE TABLE procura_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  project_ref            uuid NOT NULL REFERENCES projects(id),
  should_cost_target_usd numeric(18,4),
  should_cost_model_ref  uuid,
  baseline_usd           numeric(18,2),
  stage                  text NOT NULL DEFAULT 'intake'
    CHECK (stage IN ('intake','research','rfp_build','distribute_bids','evaluation','recommendation','award','complete')),
  crew_outputs           jsonb NOT NULL DEFAULT '{"researcher":[],"rfp_architect":[],"bid_handler":[],"recommender":[]}'::jsonb,
  evaluation_matrix      jsonb NOT NULL DEFAULT '{"criteria":[],"lockedAt":null}'::jsonb,
  bids                   jsonb NOT NULL DEFAULT '[]'::jsonb,
  award                  jsonb,
  log                    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  agent         text NOT NULL,
  trigger       text NOT NULL DEFAULT 'user' CHECK (trigger IN ('user','coach')),
  triggered_by  uuid REFERENCES users(id),
  object_type   text,
  object_ref    uuid,
  inputs        jsonb,
  outputs       jsonb,
  model_used    text,
  tokens_in     integer NOT NULL DEFAULT 0,
  tokens_out    integer NOT NULL DEFAULT 0,
  cost_usd      numeric(12,6) NOT NULL DEFAULT 0,
  provenance    jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','gate_hold','complete','failed','refused','cancelled')),
  gate_holds    jsonb NOT NULL DEFAULT '[]'::jsonb,
  steps         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON agent_runs (tenant_id, object_ref);

CREATE TABLE council_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  project_ref    uuid NOT NULL REFERENCES projects(id),
  participants   jsonb NOT NULL DEFAULT '[]'::jsonb,
  transcript     jsonb NOT NULL DEFAULT '[]'::jsonb,
  consensus      text,
  dissent        text,
  recorded_by    text NOT NULL DEFAULT 'SCRIBE',
  human_decision jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Append-only, hash-chained audit log (writes only via audit_append()).
CREATE TABLE audit_log (
  id            bigserial PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  ts            timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_name    text NOT NULL,
  channel       text NOT NULL DEFAULT 'web',
  action        text NOT NULL,
  object_type   text,
  object_ref    text,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash     text NOT NULL,
  hash          text NOT NULL
);
CREATE INDEX ON audit_log (tenant_id, ts);

-- pg-boss durable queue schema (workflow engine).
CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION eof_app;
