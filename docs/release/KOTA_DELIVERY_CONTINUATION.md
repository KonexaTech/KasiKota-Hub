# Kota delivery continuation — review candidate

Baseline PR55: `1de3e2d1ceb074696847cb14d0c502b45b19f932`; verified local snapshot tree `90f79f16fa6f032263c046215efaf5be0a2cb4d1`. Existing PR branches preserved. Disabled by default; no deployed integration or beta approval.

## Changes

- Lookup now requires existing merchant delivery-ready `out_for_delivery`, approved shop and immutable dispatch-ready quote; preparing food cannot be dispatched. Bicycle only. Pricing remains HOLD. No payments, payouts, commission or merchant completion writes.
- Authorized owner intake signs the fixed source/order contract, accepts HTTPS origin only, refuses redirects and persists a one-order/one-job association after valid acknowledgement. Retries use Delivery's existing source/order idempotency. A regression injects a lost remote acknowledgement followed by local notification failure, then verifies one simulated remote job, one committed local association and exactly two recipient notifications after retry.
- Callbacks verify exact fields, size, timestamp and HMAC before SQL. Transactional receipt/hash, job binding and sequence checks reject conflicts, backwards and terminal-state changes. Older events ACK without regression. Failed commits never ACK success.
- Initial intake and newer changed states atomically create existing `order_status` notifications for actual customer and merchant. Duplicates/older events create no duplicate notifications. Database notification generation is not external push delivery.
- Customer/owner/admin tracking reads persisted state without courier location/PII. Guest-secret ownership preserved. Actual customer and legacy tracking label searching as queued with no courier assignment confirmed. Existing owner dialog shows a delivery action only when capability enabled.

## Approval and rollback

Private settings remain default OFF: `DELIVERY_SOURCE_LOOKUP_ENABLED`, `DELIVERY_LOOKUP_TOKEN`; `DELIVERY_DISPATCH_ENABLED`, `DELIVERY_SERVICE_URL`, `DELIVERY_INTAKE_SECRET`; `DELIVERY_CALLBACKS_ENABLED`, `DELIVERY_CALLBACK_SECRET`. Keys must be distinct per source/direction, at least 32 bytes, never client configuration.

Existing quote-schema and new callback-schema SQL files in this directory are **PROPOSED ONLY**. No remote DDL, deployment or secrets were changed. Before owner-approved staging application: inspect actual schema/roles, capture recoverable snapshot, review least-privilege server grants/RLS and approve quotation/payment/COD policy. Zero-valued isolated test quotes do not establish free-delivery business rules.

Rollback: disable the three feature flags and revert code. Retain quote, receipt, association and notification records for reconciliation; never truncate/drop for rollback.

## Evidence

- Focused lookup/intake/callback: 14 PASS, including actual isolated embedded PostgreSQL schema/transaction tests and HMAC assertions; not hosted role acceptance.
- Worker check: all 18 isolated test files PASS.
- Chromium existing button regression: six LOCAL_MOCK_ONLY groups PASS, 95 API calls, including hidden/enabled owner delivery control and queued customer tracking.
- Eight existing HTML script syntax checks PASS.
- Worker dry production bundle PASS: 296.40 KiB. No deployment.
- Full final-source regression: 130 tests, 128 PASS, zero FAIL, two explicit skips for independent-connection PostgreSQL concurrency tests without the disposable local CI service. These skips are not passes. Exact final-commit CI is reported in the PR.

## Remaining BLOCKED

Owner approval for proposed staging SQL/role grants and quote policy; private service credentials; source-matched hosted role and cross-app integration tests; real driver availability; physical Android/PWA acceptance and actual push. No actual dispatch, driver assignment, payment, production rollout or beta-readiness claim.

## Delivery-side key encoding

Delivery `DELIVERY_SOURCE_CONFIG.kota` must use exact source HTTPS `apiOrigin`, raw `lookupToken`, `hmacKeyBase64 = Base64(UTF8(DELIVERY_INTAKE_SECRET))` and `callbackHmacKeyBase64 = Base64(UTF8(DELIVERY_CALLBACK_SECRET))`. The source Worker takes raw UTF-8 keys, not their base64 strings. Delivery decodes these base64 fields to the same bytes. Distinct callback-key support requires Delivery's corresponding continuation PR; do not enable a distinct callback key against a sender that still uses the intake key. Signed-in identity origin is the same origin enforced by the existing Neon JWT verifier; guest identity remains `kota:guest:<opaque hash>`.
