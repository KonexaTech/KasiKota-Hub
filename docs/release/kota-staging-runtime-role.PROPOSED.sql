-- PROPOSED ONLY. Never auto-run or apply to production.
-- Neon project young-bird-19918639, branch br-restless-dew-zagey7le (kota-connect-development).
-- Reviewed source b01ff519344cd11daa85761a0e2ce2c2da9cd07a.
-- Before any application: verify branch/compute identity, backup, existing ACLs,
-- disabled commission trigger, exact schema and current API source. Stop on drift.
-- A separate reviewed transaction and actual runtime-role regression is required.
-- Role is deliberately NOLOGIN until credentials can be provisioned securely;
-- do not use the Neon API role-creation path if it grants neon_superuser.
BEGIN;
CREATE ROLE kc_staging_worker NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public, neon_auth TO kc_staging_worker;
GRANT SELECT ON public.kc_admins, public.kc_shops, public.kc_menu_items,
 public.kc_orders, public.kc_order_items, public.kc_order_status_events,
 public.kc_shop_applications, public.kc_notifications TO kc_staging_worker;
GRANT SELECT (id, "emailVerified", banned, "banExpires") ON neon_auth."user" TO kc_staging_worker;
GRANT INSERT (owner_subject,name,area,address,phone,approved) ON public.kc_shops TO kc_staging_worker;
GRANT UPDATE (name,area,phone,address) ON public.kc_shops TO kc_staging_worker;
GRANT INSERT (shop_id,name,price_cents) ON public.kc_menu_items TO kc_staging_worker;
GRANT UPDATE (name,price_cents,available) ON public.kc_menu_items TO kc_staging_worker;
GRANT INSERT (order_number,shop_id,customer_subject,customer_name,customer_phone,area,delivery_address,fulfillment_type,subtotal_cents,delivery_cents,total_cents,test_order,client_request_id) ON public.kc_orders TO kc_staging_worker;
GRANT UPDATE (status,owner_note,updated_at) ON public.kc_orders TO kc_staging_worker;
GRANT INSERT (order_id,menu_item_id,item_name,unit_price_cents,quantity) ON public.kc_order_items TO kc_staging_worker;
GRANT INSERT (order_id,previous_status,new_status,actor_subject,actor_role,note) ON public.kc_order_status_events TO kc_staging_worker;
GRANT INSERT (applicant_subject,owner_name,shop_name,phone,area,address,description) ON public.kc_shop_applications TO kc_staging_worker;
GRANT UPDATE (status,reviewed_by_subject,reviewed_at) ON public.kc_shop_applications TO kc_staging_worker;
GRANT INSERT (recipient_subject,order_id,kind,title,body) ON public.kc_notifications TO kc_staging_worker;
GRANT UPDATE (read_at) ON public.kc_notifications TO kc_staging_worker;
-- No commission ledger/payment, admin mutation, auth mutation, DELETE or TRUNCATE grants.
-- No push tables exist in the observed branch; keep provider dispatch disabled.
-- No RLS policy change here: role is a trusted server role, not a customer identity.
-- Production records remain untouched. Regression must include independent
-- customer/owner/admin identities, cross-user denials and all order transitions.
COMMIT;
