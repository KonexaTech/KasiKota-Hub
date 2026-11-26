-- PROPOSED ONLY. Apply only to the isolated Kota Connect Neon development branch.
-- Requires the additive quote and callback tables from PR #75.
-- Create the login separately with Neon-managed password generation; store its
-- connection string only as KOTA_DELIVERY_DATABASE_URL on the Kota Worker.
-- Never grant membership in neondb_owner or any elevated Neon role.
--
-- The Neon role bootstrap initially grants read-only access to the public schema.
-- Remove that broad access (including future-table defaults) before granting the
-- narrowly required columns below. This prevents delivery from reading customer
-- names, phone numbers, delivery addresses, menus, commissions or applications.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM kc_delivery_bridge;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  REVOKE SELECT ON TABLES FROM kc_delivery_bridge;

GRANT USAGE ON SCHEMA public TO kc_delivery_bridge;
GRANT SELECT (id, customer_subject, fulfillment_type, status, delivery_cents, shop_id)
  ON public.kc_orders TO kc_delivery_bridge;
GRANT SELECT (id, owner_subject, approved)
  ON public.kc_shops TO kc_delivery_bridge;
GRANT SELECT (subject) ON public.kc_admins TO kc_delivery_bridge;
GRANT SELECT ON public.kc_delivery_quotes TO kc_delivery_bridge;

GRANT SELECT, INSERT ON public.kc_delivery_dispatches TO kc_delivery_bridge;
GRANT SELECT, INSERT ON public.kc_delivery_state TO kc_delivery_bridge;
GRANT UPDATE (sequence, status, occurred_at) ON public.kc_delivery_state TO kc_delivery_bridge;
GRANT SELECT, INSERT ON public.kc_delivery_events TO kc_delivery_bridge;
GRANT INSERT (recipient_subject, order_id, kind, title, body)
  ON public.kc_notifications TO kc_delivery_bridge;

CREATE POLICY kc_delivery_quotes_bridge_select ON public.kc_delivery_quotes
  FOR SELECT TO kc_delivery_bridge USING (true);
CREATE POLICY kc_delivery_dispatches_bridge_select ON public.kc_delivery_dispatches
  FOR SELECT TO kc_delivery_bridge USING (true);
CREATE POLICY kc_delivery_dispatches_bridge_insert ON public.kc_delivery_dispatches
  FOR INSERT TO kc_delivery_bridge WITH CHECK (true);
CREATE POLICY kc_delivery_state_bridge_select ON public.kc_delivery_state
  FOR SELECT TO kc_delivery_bridge USING (true);
CREATE POLICY kc_delivery_state_bridge_insert ON public.kc_delivery_state
  FOR INSERT TO kc_delivery_bridge WITH CHECK (true);
CREATE POLICY kc_delivery_state_bridge_update ON public.kc_delivery_state
  FOR UPDATE TO kc_delivery_bridge USING (true) WITH CHECK (true);
CREATE POLICY kc_delivery_events_bridge_select ON public.kc_delivery_events
  FOR SELECT TO kc_delivery_bridge USING (true);
CREATE POLICY kc_delivery_events_bridge_insert ON public.kc_delivery_events
  FOR INSERT TO kc_delivery_bridge WITH CHECK (true);

-- No permission to insert/update orders, shops, prices, payment state, payouts,
-- quote approvals or commission records. Quote table is read-only and immutable.
-- Rollback: unset KOTA_DELIVERY_DATABASE_URL and all delivery integration flags;
-- retain event/association/quote records for reconciliation.
