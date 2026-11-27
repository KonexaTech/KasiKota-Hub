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
-- Historical records remain NULL; never invent missing inputs.
COMMIT;
