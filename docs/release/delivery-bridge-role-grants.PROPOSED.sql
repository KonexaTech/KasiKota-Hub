-- PROPOSED ONLY. Apply only to the isolated Kota Connect Neon development branch.
-- Requires the three delivery tables from the quote and callback proposal files.
-- The login role is created separately with a newly generated private password;
-- store its connection string only as the KOTA_DELIVERY_DATABASE_URL Worker secret.
-- Never grant this role membership in neondb_owner or any elevated Neon role.
GRANT USAGE ON SCHEMA public TO kc_delivery_bridge;
GRANT SELECT ON public.kc_orders, public.kc_shops, public.kc_admins, public.kc_delivery_quotes TO kc_delivery_bridge;
GRANT SELECT, INSERT ON public.kc_delivery_dispatches TO kc_delivery_bridge;
GRANT SELECT, INSERT, UPDATE ON public.kc_delivery_state TO kc_delivery_bridge;
GRANT SELECT, INSERT ON public.kc_delivery_events TO kc_delivery_bridge;
GRANT INSERT (recipient_subject, order_id, kind, title, body) ON public.kc_notifications TO kc_delivery_bridge;

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

-- The bridge can read order/shop/admin records but cannot insert or alter them.
-- It cannot create/approve quotes, change prices, mark payments, or change payouts.
-- Rollback: unset KOTA_DELIVERY_DATABASE_URL and all integration flags; preserve records.
