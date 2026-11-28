-- Disable KOTA_SHOP_ADMIN_ENABLED before executing this staging-only rollback.
-- Audit table/history/trigger are deliberately retained. No DROP or data deletion.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $guard$ BEGIN IF current_database()<>'neondb' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $guard$;
REVOKE UPDATE(approved) ON public.kc_shops FROM kc_staging_worker;
REVOKE SELECT,INSERT ON public.kc_shop_admin_events FROM kc_staging_worker;
COMMIT;
