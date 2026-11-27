-- STAGING ONLY. Disable KOTA_DELIVERY_ORDER_SYNC_ENABLED and drain callbacks first.
-- Captured 2026-11-27 on young-bird-19918639 / br-restless-dew-zagey7le.
-- Recheck for drift. Preserve all orders/events/notifications; no rows are deleted.
BEGIN;
CREATE OR REPLACE FUNCTION public.kc_validate_order_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF; IF NOT ((OLD.status = 'pending' AND NEW.status IN ('accepted','rejected','delayed')) OR (OLD.status = 'delayed' AND NEW.status IN ('accepted','rejected')) OR (OLD.status = 'accepted' AND NEW.status IN ('preparing','rejected','delayed')) OR (OLD.status = 'preparing' AND NEW.status IN ('ready_for_collection','out_for_delivery','delayed')) OR (OLD.status = 'ready_for_collection' AND NEW.status = 'completed') OR (OLD.status = 'out_for_delivery' AND NEW.status = 'completed')) THEN RAISE EXCEPTION 'Invalid order status transition from % to %', OLD.status, NEW.status; END IF; RETURN NEW; END; $function$;
DROP FUNCTION public.kc_apply_staging_delivery_event(uuid,uuid,uuid);
COMMIT;
