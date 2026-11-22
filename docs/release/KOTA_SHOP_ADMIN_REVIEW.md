# Reviewed shop suspension/resumption foundation

Scope: new server-side shop approval management and existing staging administrator cards. No production changes or remote SQL application performed.

Read-only existing Kota development inspection confirmed `kc_shops.approved`, administrator subjects in `kc_admins`, and notification kinds limited to `new_order`, `order_status`, `application_status`. There was no shop suspension/resumption API or durable administrator action history. New notifications reuse `application_status`; no existing CHECK or monetary rules change.

## Activation prerequisites and rollback

1. Review additive `neon/migrations/009_shop_admin_events.sql` against the existing development schema and appropriate backup. It adds one private audit table, index and append-only update/delete trigger; existing rows are unchanged. The server role's grants and RLS behavior must be inspected before activation. No browser grants/policies are added.
2. Parent API must delegate to `adminShopManagement` only after existing JWT, verified-email and account-suspension checks. The module independently rechecks the server administrator table. Guest, owner and unrelated roles cannot use its routes.
3. Keep `KOTA_SHOP_ADMIN_ENABLED` absent/false until staged migration and actual administrator/merchant acceptance pass. Capability is false while disabled or its table is unavailable. The UI hides new actions in that state; it never substitutes a local state update.
4. To roll back, set `KOTA_SHOP_ADMIN_ENABLED=false` and/or restore the previous application deployment. Preserve the audit table and historical records. There is intentionally no automatic DROP TABLE rollback: removing recorded audit events requires a separate reviewed export/retention decision.

The PATCH endpoint requires an exact expected current state, a reason, and a stable request UUID. A transaction advisory lock serializes repeated IDs; row locking coordinates with checkout's existing shop lock. A stale decision returns409. Identical retry replays one recorded event, while changed retry returns409. State, append-only audit and owner notification commit together or roll back together. Audit rows do not reference mutable administrator-membership rows, so revoking an administrator is not prevented by historical records. Privileged database owners remain able to change database configuration; “append-only” is not a claim against an owner disabling triggers.

## Proposed API

- `GET /api/admin/shop-management`: administrator capability only.
- `PATCH /api/admin/shops/:uuid/approval`: `{requestId,approved,expectedCurrentApproved,reason}`; no client actor or money values.
- `GET /api/admin/shops/:uuid/approval-events?limit=50`: bounded administrator-only history.

The application maps the actor from verified authentication, never a body field. UI labels are Suspend shop/Restore approval. Pending request IDs remain stable after network failure, and the dashboard refreshes authoritative state after success. Existing design/navigation and50c/R20 commission behavior remain unchanged.

## Evidence limits

Four local behavioral module tests passed. `worker/test/admin-shop-postgres.test.mjs` runs actual PostgreSQL transactions, concurrent duplicate requests, persistence/history, role denials, notification-failure rollback and append-only constraints, but refuses hosted databases and skips explicitly if the existing disposable local PostgreSQL service is unavailable. CI must run it with `KOTA_LOCK_TEST_DATABASE_URL` on its current PostgreSQL17 service before treating SQL behavior as verified. No live staging acceptance is claimed without the approved migration, feature activation and real role sessions.

## Local verification completed

- Four module behavior cases PASS, including administrator checks, disabled/missing schema, row-lock ordering, retry conflict, stale decision and failed-notification rollback.
- One SQL-backed case PASS using the shared embedded PostgreSQL fixture and actual existing Kota migrations plus proposed009: state/history/notification persistence, replay, owner denial, constraint failure rollback, and append-only audit guards.
- Existing Chromium local-mock button suite PASS: six journey groups,76APIcalls, including controls hidden before activation, suspension with a deliberately lost response, retry using the same request ID, history viewing, and approval restoration. These are intercepted fixture APIs, not a live staging acceptance.
- Independent concurrent PostgreSQL case is prepared for the existing isolated CI service; local run explicitly SKIPPED because that service was unavailable. Do not count the skip as PASS.
- Source syntax and diff whitespace checks PASS.

No migration, deployment, administrator grant, real shop approval/suspension, production data change or monetary operation was executed by this workstream. Staging remains BLOCKED until reviewed activation and real authenticated acceptance.
