-- pg-boss (workflow engine) runs as eof_app and issues CREATE SCHEMA IF NOT
-- EXISTS on startup, which requires CREATE on the database even when the
-- schema already exists. Scoped: eof_app can create schemas, not databases.
GRANT CREATE ON DATABASE eyeonfat TO eof_app;
GRANT USAGE, CREATE ON SCHEMA pgboss TO eof_app;
