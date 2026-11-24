# Kota transaction repair continuation — 22 November 2026

PR51 was independently merged into staging during this work. This new continuation preserves staging PR52 responsiveness/bulk notifications at56ec576 and targets that existing staging branch. No merge, deployment, hosted data mutation, commission activation or database migration was performed in this increment.

## Reproduced defects and root causes

- Uppercase valid UUIDs were accepted but failed a lowercase PostgreSQL price-map lookup, throwing TypeError. An identical retry could also incorrectly return409. Three regressions reproduced checkout failure, retry conflict and blank contact/area reaching persistence. Canonicalize validated UUIDs and reject blank required fields before SQL; preserve prices, delivery charge and business rules.
- Actual Neon `kc_validate_order_status_transition` permits pending→delayed and restricts delayed→accepted/rejected. API and both owner client maps disagreed. Align all three with the inspected installed guard. Authenticated handler and UI/database-policy comparison regressions protect every fulfillment transition; no database transition rule changed.
- Actual Neon `kc_notifications_kind_check` allows new_order, order_status and application_status. New shop registration inserted new_application, causing23514 and rolling back valid applications when administrators existed. A production-handler/real-SQL regression reproduced that failure. Use the existing application_status kind; no schema expansion is necessary.

## Evidence scope

The new backend integration test runs the actual API handler against embedded PostgreSQL locally and against an independent PostgreSQL17 CI service. It loads the existing migrations in a disposable schema, creates signed fixture identities, and exercises registration→admin approval→menu→uppercase checkout→replay/conflict→delay/accept/prepare/ready/complete→tracking/history/notifications/commission. Actual persisted rows and counters are checked. Signature verification is real, but the test issuer/JWKS is a disposable fixture. It is NOT live Neon Auth or hosted staging acceptance.

Two read-only catalog checks confirmed the actual staging trigger and notification CHECK on existing project young-bird-19918639 / branch br-restless-dew-zagey7le. No privileged credentials or customer details were exported.

The prior four focused UUID/contact/lifecycle regressions passed after repair. The real-SQL flow passed after correcting registration. Final exact-commit CI and counts belong in the shared dashboard; do not reuse an earlier green badge. Embedded PostgreSQL is a development-only dependency, excluded from the production bundle. Real concurrent locking requires the isolated CI PostgreSQL service; local absence stays an explicit skip. All fixture connection guards reject hosted targets and query-string connection overrides.

## Review and rollback

The new transaction-continuation PR contains these existing-functionality repairs. A separate stacked admin-management PR contains the new gated suspension/audit module, UI and additive audit migration. Its migration and activation require separate review. Do not promote the admin extension merely to deploy the transaction fixes.

For application rollback, redeploy the previously recorded staging version through its existing guarded workflow. No database rollback is required for these transaction fixes because no migration was applied. Preserve all existing orders, sessions and test evidence.

Hosted candidate acceptance is still BLOCKED by staging promotion and exact approved fixture configuration. Protected/production merges, production deployment, real payments and commission collection remain unauthorized. R0.50 eligible completed non-test reporting and R20 threshold are unchanged.

## Manual fresh-fixture mode

The existing real-role workflow now offers an optional manual `create_fresh_test_shop` input, defaultfalse. It preserves the staging-ref/source/target guards and the original fixed-allowlist mode. When explicitly requested after source-matched deployment, it signs in using the existing four staging account secrets, verifies session identity/email/roles, creates only a new run-labelled TEST application, checks ownership in both roles before approving that exact application, creates one new TEST menu item and passes the returned exact IDs to the unchanged strict acceptance runner. No existing merchant records are changed and no credentials are logged. Nine additional helper regressions cover the scope boundaries. No actual workflow execution or fixture creation was performed while preparing this source change. This removes the need to guess existing merchant IDs or copy credentials into chat.
