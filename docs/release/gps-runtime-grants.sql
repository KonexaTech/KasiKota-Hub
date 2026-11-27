-- Isolated Kota staging only: young-bird-19918639 / br-restless-dew-zagey7le.
-- Inspected 2026-11-27: kc_staging_worker can insert every existing order-item
-- snapshot field except unit_weight_grams. GPS checkout therefore rolls back.
-- This adds exactly one INSERT column; no row, role membership or broad grant.
-- Applied to the inspected isolated staging target on 2026-11-27. Verified
-- through a direct restricted-role login and a deliberately rolled-back SQL
-- checkout/item snapshot. UPDATE/DELETE/TRUNCATE remain ungranted.
BEGIN;
GRANT INSERT (unit_weight_grams) ON public.kc_order_items TO kc_staging_worker;
COMMIT;
-- Rollback after disabling GPS checkout:
-- REVOKE INSERT (unit_weight_grams) ON public.kc_order_items FROM kc_staging_worker;
