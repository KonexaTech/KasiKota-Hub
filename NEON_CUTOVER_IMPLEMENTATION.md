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

## November 17 progress
- Added checkout idempotency using `(customer_subject, client_request_id)` unique partial index; applied **only** to the Neon development branch. Caller must send `requestId` UUID; staging client retains the key across retries.
- GitHub Actions ordering checks run #79 passed after idempotency implementation.
- The live customer, owner and admin HTML files still contain Firebase code and have NOT been cut over.
- A standalone `neon-staging.html` exists but a deployed staging Worker and real authenticated end-to-end checks remain outstanding.
- Firebase historical records have not been exported; migrating accounts requires re-enrollment/password reset rather than copying Firebase password hashes.
- Android native project files are not present in the repository root; no installable APK or native closed-app push can be claimed. FCM is a push transport, distinct from Firebase database/Auth; completely eliminating all Firebase/Google push dependencies requires a separate Android notification transport strategy, with device compatibility limitations.
- Production remains untouched; do not merge or retire Firebase until user data is reconciled and acceptance tests pass.
