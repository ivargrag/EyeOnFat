-- SECURITY DEFINER helpers.
-- Auth lookups run before a tenant context exists (login, refresh), so they
-- bypass RLS in a narrowly-scoped, read-only way.

CREATE OR REPLACE FUNCTION auth_user_by_email(p_email text)
RETURNS TABLE (
  id uuid, tenant_id uuid, email text, name text, password_hash text,
  roles text[], mfa_enabled boolean, mfa_secret text, award_authority boolean, active boolean
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT u.id, u.tenant_id, u.email, u.name, u.password_hash,
         u.roles, u.mfa_enabled, u.mfa_secret, u.award_authority, u.active
  FROM users u
  WHERE lower(u.email) = lower(p_email) AND u.deleted_at IS NULL
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION auth_refresh_lookup(p_token_hash text)
RETURNS TABLE (id uuid, tenant_id uuid, user_id uuid, expires_at timestamptz, revoked boolean)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT r.id, r.tenant_id, r.user_id, r.expires_at, r.revoked
  FROM refresh_tokens r WHERE r.token_hash = p_token_hash LIMIT 1
$$;

-- Hash-chained audit append: hash = sha256(prev_hash || canonical payload).
-- Runs atomically; per-tenant chain.
CREATE OR REPLACE FUNCTION audit_append(
  p_tenant uuid, p_actor uuid, p_actor_name text, p_channel text,
  p_action text, p_object_type text, p_object_ref text, p_payload jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_prev text;
  v_hash text;
  v_id bigint;
BEGIN
  SELECT hash INTO v_prev FROM audit_log
   WHERE tenant_id = p_tenant ORDER BY id DESC LIMIT 1 FOR UPDATE;
  IF v_prev IS NULL THEN v_prev := 'GENESIS'; END IF;
  v_hash := encode(digest(
    v_prev || '|' || p_action || '|' || coalesce(p_object_type,'') || '|' ||
    coalesce(p_object_ref,'') || '|' || p_payload::text || '|' || now()::text,
    'sha256'), 'hex');
  INSERT INTO audit_log (tenant_id, actor_user_id, actor_name, channel, action, object_type, object_ref, payload, prev_hash, hash)
  VALUES (p_tenant, p_actor, p_actor_name, coalesce(p_channel,'web'), p_action, p_object_type, p_object_ref, coalesce(p_payload,'{}'::jsonb), v_prev, v_hash)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION auth_user_by_email(text) TO eof_app;
GRANT EXECUTE ON FUNCTION auth_refresh_lookup(text) TO eof_app;
GRANT EXECUTE ON FUNCTION audit_append(uuid, uuid, text, text, text, text, text, jsonb) TO eof_app;
GRANT EXECUTE ON FUNCTION current_tenant_id() TO eof_app;
