# Kota Connect — Neon API contract (implementation gate)

This contract is the target for the Cloudflare Worker backend. **Only public GET /api/shops, GET /api/shops/:shopId/menu, GET /health and GET /api/health/db are currently implemented.** All other routes are intentionally unavailable until secure authentication is connected.

## Identity and permissions

- Browser users authenticate with a trusted identity provider. The Worker validates signed session tokens server-side, including issuer, audience, expiry, and signature. Do not trust browser-supplied roles, user IDs, shop IDs, or prices.
- Customers may create and read only their own orders.
- Approved owners may read and update only orders belonging to shops whose `owner_subject` matches their verified subject.
- Admin privileges must be established server-side from a separate verified allowlist/role record. Never accept an `isAdmin` browser field.
- Unauthenticated callers may read approved shop catalog and menus only.
- All private responses use `Cache-Control: no-store`. CORS origin checks are not authorization.

## Target endpoints

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | /api/shops | Public | Approved shop catalog |
| GET | /api/shops/:shopId/menu | Public | Available menu items with prices in cents |
| POST | /api/orders | Customer | Validate shop and menu, calculate total server-side, insert order and items in one transaction |
| GET | /api/orders/:orderId | Order customer, owner, admin | Fetch scoped order and status |
| GET | /api/orders/mine | Customer | Paginated personal orders |
| GET | /api/owner/orders | Approved owner | Paginated orders for owned shops |
| PATCH | /api/owner/orders/:orderId/status | Approved owner | Legal status transition with audit event in same transaction |
| GET | /api/admin/orders | Admin | Paginated oversight with filters |
| GET | /api/admin/summary | Admin | Completed orders, shops, commission estimates |

## Checkout invariants

- Reject unapproved shops, missing/unavailable items, invalid quantities, and items from a different shop.
- Resolve item prices in the database and calculate total in integer cents; never accept totals from the browser.
- Accept only pickup or delivery, with delivery price from server-side policy; never trust user-entered delivery fees.
- Require customer name, phone, area and delivery address when delivery is selected.
- Use idempotency keys to prevent duplicate orders on retries.
- Insert order, items, and initial audit event in one database transaction.
- Return the opaque UUID and display order reference only after commit.

## Tracking and notifications

- Poll `GET /api/orders/:orderId` while the tracking page is open, or add authenticated SSE later.
- Owners poll their own pending orders and see a visible in-app alert when a new order arrives.
- Closed-app Android push requires a separate push subscription/permission/delivery mechanism and device tests. Polling cannot provide closed-app push.
- Audit every owner status update and expose only customer-safe fields.

## Status transitions

- pending -> accepted, rejected
- accepted -> preparing, delayed, rejected
- preparing -> ready_for_collection (pickup), out_for_delivery (delivery), delayed
- delayed -> accepted, preparing, ready_for_collection (pickup), out_for_delivery (delivery), rejected
- ready_for_collection -> completed
- out_for_delivery -> completed
- completed and rejected are terminal.

## Deployment and migration safety

1. Deploy Worker to Cloudflare with development Neon branch binding/secret, not production.
2. Verify `GET /health` and `GET /api/health/db`; do not expose credentials or error traces.
3. Choose and configure identity; test that forged/expired tokens fail.
4. Implement scoped APIs and automated access-control tests.
5. Import approved Firebase shops/menus with legacy IDs, reconcile owner identities, and verify record counts.
6. Run two-customer, two-owner and admin tests, including forbidden cross-account reads.
7. Switch frontend behind a reversible feature flag. Keep Firebase data as rollback source until accepted.
