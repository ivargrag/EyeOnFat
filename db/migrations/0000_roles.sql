-- Roles. The API connects as eof_app (NOBYPASSRLS) so Row-Level Security applies.
-- Default passwords match .env.example — CHANGE IN PRODUCTION (see RUNBOOK.md).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eof_app') THEN
    CREATE ROLE eof_app LOGIN PASSWORD 'eof_app_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
