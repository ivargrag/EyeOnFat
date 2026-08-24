-- Row-Level Security keyed on tenant_id (defence-in-depth on top of app scoping).
-- The API sets `SET LOCAL app.tenant_id = '<uuid>'` inside each transaction.

-- Grants for the app role.
GRANT USAGE ON SCHEMA public TO eof_app;
GRANT SELECT ON tenants, fx_rates, model_registry TO eof_app;
GRANT INSERT ON fx_rates TO eof_app;                          -- daily FX sync
GRANT UPDATE (settings) ON tenants TO eof_app;                -- admin settings via app
GRANT SELECT, INSERT, UPDATE ON
  users, refresh_tokens, connectors, intake_files, spend_records, spend_nodes,
  should_cost_models, projects, gates, procura_events, agent_runs, council_sessions
TO eof_app;
-- NO DELETE anywhere: destructive actions are soft-delete + audit.
GRANT SELECT, INSERT ON audit_log TO eof_app;                 -- append-only
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO eof_app;

-- Helper: current tenant from per-transaction setting.
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

-- Enable + force RLS on every tenant-scoped table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','refresh_tokens','connectors','intake_files','spend_records','spend_nodes',
    'should_cost_models','projects','gates','procura_events','agent_runs','council_sessions','audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())',
      t);
  END LOOP;
END $$;

-- Audit log is append-only even for the owner: block UPDATE/DELETE at trigger level.
CREATE OR REPLACE FUNCTION audit_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$;
CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_block_mutation();
