-- PROPOSED: isolated Kota staging only, young-bird-19918639 /
-- br-restless-dew-zagey7le. Inspect definitions/ACLs and take a private schema
-- backup before approval. No existing row is rewritten and no payment is made.
-- Deploy code with KOTA_DELIVERY_ORDER_SYNC_ENABLED=false until this is approved.
BEGIN;
CREATE OR REPLACE FUNCTION public.kc_validate_order_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 IF NEW.fulfillment_type='delivery' AND NEW.status IN ('out_for_delivery','completed')
    AND NOT EXISTS (
      SELECT 1 FROM public.kc_delivery_state s
      JOIN public.kc_delivery_dispatches d ON d.order_id=s.order_id AND d.job_id=s.job_id
      WHERE s.order_id=NEW.id
        AND ((NEW.status='out_for_delivery' AND s.status IN ('collected','enroute'))
          OR (NEW.status='completed' AND s.status='delivered'))
    ) THEN
  RAISE EXCEPTION 'Verified driver event required' USING ERRCODE='42501';
 END IF;
 IF NOT (
  (OLD.status='pending' AND NEW.status IN ('accepted','rejected','delayed')) OR
  (OLD.status='delayed' AND NEW.status IN ('accepted','rejected')) OR
  (OLD.status='accepted' AND NEW.status IN ('preparing','rejected','delayed')) OR
  (OLD.status='preparing' AND NEW.status IN ('ready_for_collection','out_for_delivery','delayed')) OR
  (OLD.status='ready_for_collection' AND NEW.status='completed') OR
  (OLD.status='ready_for_collection' AND NEW.status='out_for_delivery' AND NEW.fulfillment_type='delivery') OR
  (OLD.status='out_for_delivery' AND NEW.status='completed')
 ) THEN RAISE EXCEPTION 'Invalid order status transition from % to %',OLD.status,NEW.status; END IF;
 RETURN NEW;
END;
$$;

-- Only the dedicated callback role can call this entrypoint. Its caller must
-- first persist the HMAC-verified event and latest state in the SAME transaction.
-- The role still receives no direct UPDATE privilege on customer order rows.
CREATE FUNCTION public.kc_apply_staging_delivery_event(p_order uuid,p_job uuid,p_event uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE saved public.kc_orders%ROWTYPE; driver_status text; target_status text;
BEGIN
 SELECT e.status INTO driver_status FROM public.kc_delivery_events e
 JOIN public.kc_delivery_state s ON s.order_id=e.order_id AND s.job_id=e.job_id
   AND s.sequence=e.sequence AND s.status=e.status
 JOIN public.kc_delivery_dispatches d ON d.order_id=e.order_id AND d.job_id=e.job_id
 WHERE e.event_id=p_event AND e.order_id=p_order AND e.job_id=p_job;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO saved FROM public.kc_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR saved.fulfillment_type<>'delivery' OR saved.test_order IS NOT TRUE THEN RETURN false; END IF;
 target_status:=CASE WHEN driver_status IN ('collected','enroute') THEN 'out_for_delivery'
   WHEN driver_status='delivered' THEN 'completed' ELSE NULL END;
 IF target_status IS NULL THEN RETURN false; END IF;
 IF saved.status=target_status OR saved.status='completed' THEN RETURN true; END IF;
 IF saved.status NOT IN ('ready_for_collection','out_for_delivery') THEN RETURN false; END IF;
 UPDATE public.kc_orders SET status=target_status,updated_at=now() WHERE id=p_order;
 INSERT INTO public.kc_order_status_events(order_id,previous_status,new_status,actor_subject,actor_role,note)
 VALUES(p_order,saved.status,target_status,'delivery:'||p_job::text,'system','Verified driver event');
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.kc_apply_staging_delivery_event(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kc_apply_staging_delivery_event(uuid,uuid,uuid) TO kc_delivery_bridge;
COMMIT;
-- Rollback: first disable KOTA_DELIVERY_ORDER_SYNC_ENABLED and drain callbacks.
-- Restore the captured prior trigger definition/ACL after reviewing queued events.
-- Preserve all events, orders and audit rows; never truncate or delete to roll back.
