-- Private staging only. Review runtime role grants and RLS before applying.
BEGIN;
ALTER TABLE kc_shops ADD COLUMN IF NOT EXISTS pickup_lat double precision CHECK (pickup_lat BETWEEN -90 AND 90),
 ADD COLUMN IF NOT EXISTS pickup_lon double precision CHECK (pickup_lon BETWEEN -180 AND 180),
 ADD COLUMN IF NOT EXISTS pickup_location_saved_at timestamptz;
ALTER TABLE kc_menu_items ADD COLUMN IF NOT EXISTS weight_grams integer CHECK (weight_grams BETWEEN 1 AND 100000);
ALTER TABLE kc_orders ADD COLUMN IF NOT EXISTS dropoff_lat double precision CHECK (dropoff_lat BETWEEN -90 AND 90),
 ADD COLUMN IF NOT EXISTS dropoff_lon double precision CHECK (dropoff_lon BETWEEN -180 AND 180),
 ADD COLUMN IF NOT EXISTS delivery_location_saved_at timestamptz;
ALTER TABLE kc_order_items ADD COLUMN IF NOT EXISTS unit_weight_grams integer CHECK (unit_weight_grams BETWEEN 1 AND 100000);
-- Coordinate pairs and timestamps must be supplied together.
ALTER TABLE kc_shops ADD CONSTRAINT kc_shop_pickup_pair CHECK (
 (pickup_lat IS NULL AND pickup_lon IS NULL AND pickup_location_saved_at IS NULL)
 OR (pickup_lat IS NOT NULL AND pickup_lon IS NOT NULL AND pickup_location_saved_at IS NOT NULL));
ALTER TABLE kc_orders ADD CONSTRAINT kc_order_dropoff_pair CHECK (
 (dropoff_lat IS NULL AND dropoff_lon IS NULL AND delivery_location_saved_at IS NULL)
 OR (dropoff_lat IS NOT NULL AND dropoff_lon IS NOT NULL AND delivery_location_saved_at IS NOT NULL));
-- Historical records remain NULL; never invent missing inputs.
-- Consolidates PR #83; do not apply its separate proposal.
-- Apply once only after isolated staging schema and runtime grant verification.
COMMIT;
