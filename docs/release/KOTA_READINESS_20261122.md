# Kota Connect release evidence — 22 November 2026

Decision: **NOT READY for public release.** This repair candidate is for the existing Neon staging line only. No deployment, database migration, payment activation, or production data change was performed.

## Verified repository and baseline

- Repository: `KonexaTech/KasiKota-Hub` (the connected GitHub account is now KonexaTech).
- Public `main`: `6d6b30e6b5be92d1ef2fd303d788cbef6cfc706f`.
- Active Neon staging baseline: `feature/neon-only-cutover` at `ea3eca7ae020b463e2d3b2a5944570a60a2bae5c`.
- Repair branch: `development/kota-release-integrity-20261122`, based on that staging baseline. Targeting staging avoids silently promoting the unapproved Neon cutover to production.
- Existing open work preserved: PR #50 checkout shop lock, #41 role acceptance, #39 recovery routing, #36 full audit. Existing fixes were inspected, not overwritten or merged. The exact approved-shop row lock and focused regressions from #50 are composed into this repair branch; #50 remains open and unchanged. No GitHub merge was performed.
- Configured customer staging URL: `https://kota-connect-neon-staging.pages.dev/neon-customer.html`; Worker: `https://kota-connect-api-dev.siboniisozulu.workers.dev`. Public repository homepage still names the former-owner GitHub Pages address; no assertion is made that its redirects/install upgrades are accepted.
- Dedicated Neon project `young-bird-19918639`, development branch `br-restless-dew-zagey7le` (`kota-connect-development`) matches the configured endpoint and existing migration documentation. Production branch was not modified.

## Inventory and confirmed fixes

| Area | Implementation and evidence | Remaining acceptance |
| --- | --- | --- |
| Discovery/menu | Approved-shop and available-menu server queries; existing customer browser fixture passed | Current deployed customer/real-owner journey and mobile accessibility |
| Order persistence | Transactional order/items/status events/notifications; server menu pricing; unique customer/request id and replay comparison | Concurrent deployed acceptance and connection-loss recovery |
| Checkout shop concurrency | Added the existing PR50 `FOR SHARE` lock inside the checkout transaction, plus query-order and isolated PostgreSQL writer-lock regressions | CI PostgreSQL lock test and deployed concurrent suspension acceptance; full suspension workflow still not implemented |
| Checkout validation | Fixed nullable items crashing request processing, coercible UUID arrays, non-string/blank delivery addresses, invalid optional pickup address types; three focused behavioral tests passed | Run these invalid cases through deployed staging Worker |
| Customer/owner/admin | Existing signed Neon JWTs, verified-email/ban checks, shop ownership and server admin table; guest credentials limited to customer routes | Re-run authenticated acceptance against this candidate, session revocation and full owner suspension workflow |
| Commission | Existing estimates retain **50 cents per completed non-test order** and **2,000-cent threshold**; collection remains paused | Approved collection/payment reconciliation; no actual payment proof claimed |
| Payments | No secure provider payment confirmation demonstrated by this repair | Provider sandbox and signed confirmation/replay/refund acceptance required |
| Notifications | Existing database notifications and foreground polling; browser fixture passed | Real foreground/background/closed Android push, deep links and account switching |
| Firebase retirement | Fixed concatenated legacy Firebase imports and branch markers in intended self-unregistering retired service worker | Verify previously installed PWA retires it in real browser/device; no Firebase added |
| Android | Existing package `za.co.kotaconnect.staging`, workflow forces minimum SDK26; web asset preparation passed | Stable signing, candidate APK build/integrity, installation/upgrade and real-device testing |
| Delivery | Existing delivery checkout charges500cents; no verified courier integration/coverage implied | Authenticated source-order/approved quote lookup, dispatch/courier proof and reconciliation |

The repair does not change navigation, approved UI, delivery pricing, commission rates, identity provider or database architecture.

## Tests and builds executed

- Before repair: checkout behavior reproduced `TypeError` for `items:[null]`; server-price and replay/conflict controls passed. Broader baseline also exposed a corrupted obsolete static test (`worker` redeclared / branch markers).
- After repair: `node --test worker/test/*.test.mjs tests/*.test.mjs tests/*.test.cjs` — **88 passed, 0 failed, 1 skipped** across89identified cases. The skipped case explicitly requires an isolated local PostgreSQL database; it is not a pass.
- `npm run check --prefix worker` — passed source syntax, six Worker test files (including the explicitly skipped local PostgreSQL fixture) and integration-script parsing. This is not a live integration run.
- `node tests/browser-script-syntax.cjs` — all eight listed HTML entry points parsed successfully.
- `CHROMIUM_PATH=/usr/bin/chromium node tests/verify-browser-all-buttons.mjs` — **PASS, LOCAL_MOCK_ONLY**, five customer/owner/admin journey groups, 67 intercepted API calls. This does not prove hosted data persistence or physical Android behavior.
- `node android-staging/scripts/prepare-web.mjs` — passed isolated staging web-asset preparation.
- `XDG_CONFIG_HOME=/tmp/kota-config WRANGLER_SEND_METRICS=false npx wrangler deploy --dry-run --outdir /tmp/kota-worker-build` in `worker` — passed bundle, 270.18KiB uncompressed /58.46KiB gzip. **No deployment.**
- Worker production dependency audit: **0 known vulnerabilities**, including0high/critical, at this run. This is dependency evidence, not proof the application has no vulnerabilities.
- Added a Worker package lock and deterministic CI installation; no new dependency was introduced. The browser harness now accepts optional `CHROMIUM_PATH` for an installed test browser.

Local evidence logs: `/tmp/kota-checkout-before.log`, `/tmp/kota-combined-tests.log`, `/tmp/kota-browser-syntax.log`, `/tmp/kota-browser-buttons.log`, `/tmp/kota-worker-combined-build.log`, `/tmp/kota-worker-audit.json`. These transient paths are not permanent CI artifacts.

## Live and historical evidence

Read-only checks on22November: Worker `/api/health` returnedHTTP200, `ok:true`, `backend:neon`, `authConfigured:true`; catalog returnedHTTP200 with2shops; unauthenticated `/api/orders/mine`, `/api/owner/orders`, `/api/admin/orders` and `/api/notifications` each returnedHTTP401. These demonstrate anonymous denial and connectivity, not full tenant isolation.

Historical baseline evidence was inspected rather than inferred from a green badge:

- [Real owner/admin staging acceptance44687268165](https://github.com/KonexaTech/KasiKota-Hub/actions/runs/44687268165), baselineea3eca7: the completed job log explicitly records real signed owner/admin sessions, guest checkout, idempotency, role isolation, statuses, tracking, notifications, commission estimates, rejection and paused collection **PASS**. This is baseline evidence; the new repair commit has not been deployed or given the same live acceptance.
- [Baseline Android APK build44687268268](https://github.com/KonexaTech/KasiKota-Hub/actions/runs/44687268268) passed on the same source. It is a debug staging build, not stable signing or device acceptance for this candidate.
- [Existing shop-lock PR50 checks44892331072](https://github.com/KonexaTech/KasiKota-Hub/actions/runs/44892331072) passed for its own source, not merged here.

## Read-only database findings

The development database contains10public application tables: `kc_admins`, `kc_commission_entries`, `kc_commission_payments`, `kc_menu_items`, `kc_notifications`, `kc_order_items`, `kc_order_status_events`, `kc_orders`, `kc_shop_applications`, `kc_shops`.

Observed aggregate counts:2shops,4menu items,26orders,109notifications,0commission entries. No customer details exported. All10tables have RLSdisabled and inspected table grants belong only to `neondb_owner`; this is an API-server authorization model, **not browser-safe database access**. No connection string was exposed or committed. Runtime database-role least privilege, Data API exposure settings, default privileges and current negative tenant tests still need acceptance. Do not treat owner-only catalog grants alone as full security proof.

Order triggers inspected: `kc_status_transition_guard`, `kc_terminal_order_guard`; commission accrual trigger is absent, consistent with paused launch commission. No schema change proposed by this repair.

## Mandatory public-release gates

| Gate | Result | Evidence / missing input |
| --- | --- | --- |
| Essential current-candidate customer→owner→completion | BLOCKED | Baseline live evidence exists; repair candidate must be deployed to isolated staging and rerun |
| Authentication/authorization | BLOCKED | Baseline role suite passed; current candidate session, guest and owner/admin denial acceptance required |
| Data integrity/isolation | BLOCKED | Read-only inventory and local transaction/retry tests passed; current concurrent tenant tests and reviewed credentials required |
| No critical/high blockers | BLOCKED | Shop lock is now composed from PR50; actual concurrent staging suspension and secure delivery/payment acceptance still incomplete |
| Relevant automated regression | PASS |88/88completed local tests;1explicitly blocked PostgreSQL case; browser mock and Worker bundle passed |
| Payments/commission/notification delivery | BLOCKED | Collection paused; provider sandbox, Android push setup and live delivery proof absent |
| Android/PWA acceptance | BLOCKED | Historical debug build only; stable signing and physical install/upgrade/PWA retirement required |
| Monitoring/backup/restore | BLOCKED | Need approved operational procedure and observed restoration/alerts |
| Privacy/legal/deployment review | BLOCKED | Owner review, production cutover/migration reconciliation and rollback approval outstanding |
| Human device acceptance/sign-off | BLOCKED | Android phones and customer/merchant sign-off required |

Release-gate coverage is **1/10 mandatory gatesPASS (10%)**, not an estimate that10%of the code is implemented or a probability of readiness. The other9gates remain failed or blocked, so public release staysHOLD. The automated test pass rate is88/88completed cases (one additional case skipped asBLOCKED) (100%); this does not establish full functional coverage. No implementation or unique-control coverage percentage is claimed without a complete measured denominator.

## Exact changed files

- `worker/src/neon-api.js`: narrow checkout input validation and the transaction-scoped approved-shop lock from PR50.
- `worker/test/checkout-shop-lock.test.mjs`: exact PR50 static lock/order-rule regressions.
- `worker/test/checkout-shop-concurrency.test.mjs`: isolated real PostgreSQL proof of row-lock exclusion, commit release and later unapproved-shop denial; refuses hosted endpoints or any database other than local `kota_lock_test`. No production schemas or rows are touched.
- `worker/test/checkout-validation.test.mjs`: new behavioral regressions with isolated guest auth and fake database, no live data writes.
- `worker/package.json`, `worker/package-lock.json`: include existing guest/recovery and new checkout checks; lock existing dependency versions.
- `.github/workflows/neon-ordering.yml`: deterministic Worker install, checkout regressions and a separate disposable PostgreSQL17 concurrency job. It creates and removes a random fixture schema only in the isolated CI container; no Neon credentials are used.
- `tests/ordering-static.test.cjs`: remove corrupted concatenated obsolete Firebase assertions, retain current Neon entry/auth/retirement checks.
- `firebase-messaging-sw.js`: retain intended retirement lifecycle only, remove contradictory malformed old Firebase tail.
- `tests/verify-browser-all-buttons.mjs`: optional installed-browser executable override.
- `.gitignore`: exclude dependencies, local env/secrets, Wrangler state and generated Android/web output.
- `docs/release/KOTA_READINESS_20261122.md`: this report.

The PostgreSQL concurrency test is deliberately BLOCKED locally: no PostgreSQL server is installed, and the Docker socket is inaccessible. Its dedicated CI job must succeed before the lock is called experimentally verified.

Next milestone: review this composed repair alongside the unchanged PR50, deploy only the approved staging candidate, rerun real owner/admin/guest negative and concurrent order tests, verify source-order delivery integration in sandbox, then stable-signed Android install/upgrade and notifications. Do not merge to production or activate live payments automatically.
