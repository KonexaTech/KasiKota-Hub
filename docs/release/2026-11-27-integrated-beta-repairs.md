# Kota / Delivery private beta repairs — 27 November 2026

Baseline: PR #82, `85ad69645c173db234e0bb07ee2067e6c120378a`.
Development only. Production data, designs, guest checkout and commission rules are preserved.

## Confirmed defects repaired

- Owners could set driver-controlled delivery states when a routing flag was off or
  the request used another hostname. Deny owner `out_for_delivery` / `completed`
  for delivery orders independently of environment flags. Pickup completion remains.
- The owner pickup UI incorrectly offered out-for-delivery. Remove that option.
- Retrying an already committed ready-for-collection delivery after a lost dispatch
  acknowledgement returned a transition conflict. An authenticated, approved owner
  can retry dispatch without rewriting readiness, COD approval, history or notifications.
- GPS order request replay accepted a changed destination. Compare persisted GPS
  coordinates in both replay paths. Check GPS freshness after existing committed
  order lookup, so a delayed retry remains safe while a new stale order is rejected.
- The actual customer-facing page did not send the GPS/COD fields supported by the
  generic dashboard. Reuse the existing explicit location capture helper in the
  existing delivery-address panel; require location before delivery submission and
  send cash-on-delivery metadata. No automatic location capture on load.
- Delivery callbacks saved tracking state but did not update the source order.
  A separately gated atomic RPC now derives the source order state from a pinned,
  verified driver event. Missing RPC causes rollback/503, never a false ACK. The
  bridge receives no direct customer-order UPDATE permission. Proposed SQL and
  captured rollback are included; **not applied**. Feature flag defaults false.
- Runtime role lacked INSERT permission on the packaged item-weight snapshot.
  Reproduced 42501 under restricted permissions; one-column grant fixes it without
  adding UPDATE, DELETE or TRUNCATE. Historical eb83be4 runtime grant proposal is
  retained as regression reference, not reapplied as role creation.

## Actual staging database operation

Verified isolated target: Neon `young-bird-19918639`, branch
`br-restless-dew-zagey7le`, database `neondb`, role `kc_staging_worker`.
Applied only `GRANT INSERT(unit_weight_grams) ON public.kc_order_items TO kc_staging_worker`.
Readback confirmed column INSERT true, table UPDATE/DELETE/TRUNCATE false.
A direct restricted-role synthetic order/item insertion roundtrip succeeded within
an intentionally rolled-back SQL block. No fixture shop, menu, order or item remains.
This proves SQL permission/persistence mechanics, not hosted frontend acceptance.
Reversal is the matching one-column REVOKE in `gps-runtime-grants.sql`.

## Local evidence

- Full regression: 160 tests, 159 passed, zero failed, one independent-PostgreSQL
  case explicitly skipped without its local database. Worker check also passed.
- Subsequent customer-page repair: affected static checks and browser audit rerun.
- Chromium button audit passed five mocked journey groups, 80 API requests,
  including missing-GPS denial and explicit simulated GPS capture. This is mock
  Auth/API evidence, not live staging or physical location acceptance.
- New GPS checkout uses the actual API handler with embedded PostgreSQL and a
  restricted runtime role; synthetic routing is clearly labeled. New callback
  synchronization tests also execute SQL, roles and signed callback handler.
- Production dependency audit: zero reported vulnerabilities.
- npm ci could not complete locally because the workspace ran out of disk space.
  Dependencies reused an identical existing lockfile install. Clean npm ci and
  independent PostgreSQL 17 are mandatory CI gates; the new regression cases were
  added to both regular and independent-database workflow jobs.

## Deployment and outstanding prerequisites

Observed API and Pages deployment metadata both identify
`3738d6b012e2aa16098ab9b7906e04e87f1d3fea`, older than this candidate.
Canonical Pages, API and Delivery URLs deny unauthenticated requests via Access.
Kota routing-provider secret `KOTA_ROUTING_API_KEY` is absent; other integration
secret binding names are present (values never read). Do not enable routing,
dispatch recovery or order synchronization until reviewed prerequisites pass.

Delivery pricing stays **R15 fee / R10 unpaid driver entitlement / R5 platform
remainder**. R0.50 per eligible completed non-test marketplace order and R20 threshold
remain unchanged; collection disabled. The requested future distance tariff is
not activated: policy beyond 1km and business-approved driver capacity limits
remain open. Never represent straight-line distance as a cycling-route distance.

Before beta: exact-source CI and reviewed staging integration; approve/test the
proposed synchronization function/trigger and rollback; configure routing key and
approved operating limits; run authenticated guest/owner/admin/driver live staging
acceptance, duplicate/timeout/PIN/earnings/recovery tests; verify matching signed
APK and physical installation, updates, GPS and notifications. No beta GO.
