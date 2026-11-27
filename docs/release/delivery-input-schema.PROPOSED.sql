-- Review and apply only to isolated staging. No fabricated coordinates or weights.
BEGIN;
ALTER TABLE kc_shops ADD COLUMN pickup_lat double precision CHECK (pickup_lat BETWEEN -90 AND 90),
 ADD COLUMN pickup_lon double precision CHECK (pickup_lon BETWEEN -180 AND 180),
 ADD CONSTRAINT kc_shop_pickup_pair CHECK ((pickup_lat IS NULL) = (pickup_lon IS NULL));
ALTER TABLE kc_menu_items ADD COLUMN weight_grams integer CHECK (weight_grams > 0);
ALTER TABLE kc_orders ADD COLUMN dropoff_lat double precision CHECK (dropoff_lat BETWEEN -90 AND 90),
 ADD COLUMN dropoff_lon double precision CHECK (dropoff_lon BETWEEN -180 AND 180),
 ADD CONSTRAINT kc_order_dropoff_pair CHECK ((dropoff_lat IS NULL) = (dropoff_lon IS NULL));
COMMIT;
-- Existing records remain NULL until explicitly verified. No grants or dispatch activation.
