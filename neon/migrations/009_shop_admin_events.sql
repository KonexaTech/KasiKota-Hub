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
DROP TRIGGER IF EXISTS kc_shop_admin_events_append_only ON kc_shop_admin_events;
CREATE TRIGGER kc_shop_admin_events_append_only BEFORE UPDATE OR DELETE ON kc_shop_admin_events
  FOR EACH ROW EXECUTE FUNCTION kc_prevent_shop_admin_event_mutation();
-- No browser grants or RLS policies. Existing server-role privileges must be
-- inspected before enabling KOTA_SHOP_ADMIN_ENABLED on the staging Worker.
