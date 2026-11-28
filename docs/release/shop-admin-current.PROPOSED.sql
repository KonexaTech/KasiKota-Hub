-- PROPOSAL ONLY: young-bird-19918639 / br-restless-dew-zagey7le / neondb.
-- Requires explicit approval for this separate administrator migration.
-- Do not apply to production. No existing records are changed or removed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=public,pg_catalog;
DO $guard$
BEGIN
 IF current_database()<>'neondb' THEN RAISE EXCEPTION 'Wrong database'; END IF;
 IF to_regclass('public.kc_shop_admin_events') IS NOT NULL THEN RAISE EXCEPTION 'Audit target already exists; inspect before proceeding'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='kc_staging_worker' AND rolcanlogin AND NOT(rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)) THEN RAISE EXCEPTION 'Expected restricted role missing'; END IF;
 IF has_column_privilege('kc_staging_worker','public.kc_shops','approved','UPDATE') THEN RAISE EXCEPTION 'Approval grant drift; review first'; END IF;
 IF NOT(has_column_privilege('kc_staging_worker','public.kc_notifications','recipient_subject','INSERT') AND has_column_privilege('kc_staging_worker','public.kc_notifications','kind','INSERT') AND has_column_privilege('kc_staging_worker','public.kc_notifications','title','INSERT') AND has_column_privilege('kc_staging_worker','public.kc_notifications','body','INSERT')) THEN RAISE EXCEPTION 'Existing notification grants unavailable'; END IF;
END $guard$;
-- PROPOSED: existing Kota Connect development branch only, after owner review.
-- Additive audit storage; no existing shop, order, user or notification changes.
CREATE TABLE IF NOT EXISTS kc_shop_admin_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  shop_id uuid NOT NULL REFERENCES kc_shops(id) ON DELETE RESTRICT,
  actor_subject text NOT NULL CHECK (length(actor_subject) BETWEEN 1 AND 512),
  previous_approved boolean NOT NULL,
  approved boolean NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_subject,request_id),
  CHECK (previous_approved <> approved)
);
CREATE INDEX IF NOT EXISTS kc_shop_admin_events_shop_created_idx
  ON kc_shop_admin_events(shop_id,created_at DESC,id DESC);
ALTER TABLE kc_shop_admin_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kc_shop_admin_events FROM PUBLIC;
CREATE OR REPLACE FUNCTION kc_prevent_shop_admin_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Shop administration history is append-only' USING ERRCODE='42501';
END;
$$;
CREATE TRIGGER kc_shop_admin_events_append_only BEFORE UPDATE OR DELETE ON kc_shop_admin_events
  FOR EACH ROW EXECUTE FUNCTION kc_prevent_shop_admin_event_mutation();
-- No browser grants or RLS policies. Existing server-role privileges must be
-- inspected before enabling KOTA_SHOP_ADMIN_ENABLED on the staging Worker.

REVOKE ALL ON FUNCTION kc_prevent_shop_admin_event_mutation() FROM PUBLIC;
GRANT SELECT ON public.kc_shop_admin_events TO kc_staging_worker;
GRANT INSERT(request_id,shop_id,actor_subject,previous_approved,approved,reason) ON public.kc_shop_admin_events TO kc_staging_worker;
CREATE POLICY kc_shop_admin_read_runtime ON public.kc_shop_admin_events FOR SELECT TO kc_staging_worker USING(true);
CREATE POLICY kc_shop_admin_insert_runtime ON public.kc_shop_admin_events FOR INSERT TO kc_staging_worker WITH CHECK(true);
GRANT UPDATE(approved) ON public.kc_shops TO kc_staging_worker;
COMMIT;
