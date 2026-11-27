-- Private staging only; review and apply before deployment. No dispatch authorization.
BEGIN;
CREATE TABLE IF NOT EXISTS public.kc_pending_delivery_quotes (
order_id uuid PRIMARY KEY REFERENCES public.kc_orders(id) ON DELETE RESTRICT,
pickup_lat double precision NOT NULL CHECK(pickup_lat BETWEEN -90 AND 90),
pickup_lon double precision NOT NULL CHECK(pickup_lon BETWEEN -180 AND 180),
dropoff_lat double precision NOT NULL CHECK(dropoff_lat BETWEEN -90 AND 90),
dropoff_lon double precision NOT NULL CHECK(dropoff_lon BETWEEN -180 AND 180),
route_distance_m integer NOT NULL CHECK(route_distance_m>0),
weight_grams integer NOT NULL CHECK(weight_grams>0),
currency text NOT NULL CHECK(currency='ZAR'),
fee_cents integer NOT NULL CHECK(fee_cents=1500),
payout_cents integer NOT NULL CHECK(payout_cents=1000),
created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.kc_pending_delivery_quotes FROM PUBLIC;
GRANT INSERT ON public.kc_pending_delivery_quotes TO kc_staging_worker;
COMMIT;
