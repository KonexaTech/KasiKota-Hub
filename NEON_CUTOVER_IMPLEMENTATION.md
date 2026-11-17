# Kota Connect — Firebase to Neon migration (development branch)

## Target
Neon PostgreSQL is the sole application data store; Neon Auth owns customer, owner and administrator accounts; Cloudflare Worker is the trusted API. No browser connection string.

## Verified existing development state
Neon project `young-bird-19918639`, development branch `kota-connect-development`. Neon Auth email/password enabled. Tables include `kc_admins`, `kc_shops`, `kc_menu_items`, `kc_orders`, `kc_order_items`, `kc_order_status_events`, `kc_shop_applications`, `kc_notifications`. Production branch remains separate.

## Implemented
- `worker/src/neon-auth.js`: validate Neon Auth JWT with EdDSA, JWKS, issuer and audience; determine admin from `kc_admins`.
- `worker/src/neon-api.js`: authenticated order creation, scoped order reads, owner order list and legal status transitions, admin orders, public catalog.
- `NEON_ONLY_MODE=true` activates the new Worker API only in an explicitly configured deployment. Leave off in production until acceptance.
- Server computes menu prices and totals, writes orders/items/status events/notifications in a single transaction.

## Critical unfinished tasks — do not merge
1. Replace Firebase Auth in **every active customer/owner/admin/tracking page** with Neon Auth SDK. Provide account creation/login, verified owner/admin roles, session refresh, logout and recovery.
2. Replace Firebase Firestore reads/writes with Neon API calls; implement all needed endpoints for shop applications, shop approval, menu management, notifications and admin operations.
3. Add idempotent checkout requests, rate limiting, owner device push token registration, FCM delivery via Neon-owned identity and a retryable notification outbox.
4. Determine whether existing Firebase records need migration. Export and reconcile shops, menus, orders and owner mappings; never discard historical data. Firebase passwords cannot simply be copied; plan secure re-enrollment.
5. Implement and test Neon Auth account creation and email recovery, admin bootstrap/invites, owner approval, and negative authorization tests.
6. Configure staging Cloudflare Worker with `NEON_AUTH_URL` (development Neon Auth base URL), `NEON_ONLY_MODE=true` and staging Neon DB secret. Never expose DB credentials.
7. Verify token signature/issuer/audience, expired tokens, cross-customer and cross-owner denial, order totals, status transitions, duplicate submissions, and admin access.
8. Test on actual Android phone including closed-app push; native APK needs Capacitor FCM setup. Test the full customer → owner → admin flow.
9. Confirm rollback plan, data backup, audit logs and monitoring; only then change production traffic. Retire Firebase only after reconciliation and sign-off.

## Security
Do not use browser-provided `subject`, `role`, `ownerUid`, or `price` as authorization facts. The current Neon-only API uses server-verified identity and database ownership for the endpoints it implements. Remaining endpoints require equivalent checks.
