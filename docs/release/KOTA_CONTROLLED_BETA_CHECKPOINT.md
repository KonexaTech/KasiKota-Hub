# Kota controlled-beta checkpoint — 22 November 2026

Candidate branch: `development/kota-release-integrity-20261122`; draft PR51 targets the existing `feature/neon-only-cutover` staging branch, not production main. No merges, deployments or hosted database writes were performed.

## New acceptance safety repair

The former live role runner selected any approved shop belonging to the test owner and could not identify deployed code. It now refuses network activity without an explicit fixture-write approval, exact shop/menu UUIDs, distinct approved owner/admin subjects and expected source commit. It checks public health commit metadata before signing in or writing and refuses to substitute another shop or menu. Health exposes only a validated public Git commit, never arbitrary environment values. The existing future staging deployment command supplies its own GitHub source SHA. Existing branch/environment guards remain unchanged.

These are source repairs with isolated regression evidence, not a new live acceptance PASS. The deployed API must first be updated through the approved staging workflow, then the controlled role test rerun against that exact commit.

## Required private staging configuration

Existing `neon-staging` environment secrets remain owner/admin email and password. Do not paste them into chat or commit them. Add the following environment variables only after the owner confirms the exact disposable fixture records:

- `KOTA_TEST_CONFIRM_WRITES=true` after reviewing this write scope.
- `KOTA_TEST_SHOP_ID` and `KOTA_TEST_MENU_ITEM_ID`: exact staging fixture UUIDs.
- `KOTA_TEST_OWNER_SUBJECT` and `KOTA_TEST_ADMIN_SUBJECT`: exact distinct staging Auth identities.

The workflow obtains `KOTA_TEST_EXPECTED_SOURCE_COMMIT` from `github.sha`. No secret is used as a source marker. It creates three test orders and their status/notification records, using the existing dedicated development API, guest credentials and approved fixture owner/admin. It must not target real merchant inventory. The server retains the existing dedicated-development-host test-order flag and paused commission collection.

## Evidence and remaining gates

The composed shop lock already passed a real independent PostgreSQL17 concurrent-writer test in CI45006947364 on commit a57888c. That run and APK45006947376 are historical evidence for the source before this acceptance guard increment; do not relabel them as final-commit artifacts. Its debug APK artifact14748147393 is temporary and does not prove stable signing or installation.

Local final guard suite: 93 passed, zero failed, one explicitly skipped hosted-independent concurrency test (no local PostgreSQL). The concurrency test is run by its isolated PostgreSQL CI job. All nine focused guard/integration-structure checks passed. Worker check and dry package passed; the first dry-package invocation used the wrong working directory, then the correct `worker` directory succeeded. No deployment occurred.

Current source still needs final-head CI; exact links belong in the consolidated release dashboard after observation. Candidate live role acceptance remains BLOCKED by unapproved staging promotion and fixture configuration. Android stable signing, installation/update, notification delivery, sandbox payment/delivery integration, recovery/backup and real-device acceptance remain incomplete. Preserve R0.50 eligible non-test completed-order reporting and the R20 threshold; no commission collection/payment activation is authorized.

## Resume commands

From `/workspace/work/KasiKota-Hub`:

```sh
git status --short
git log -1 --format='%H %s'
node --test --test-isolation=none --test-reporter=spec worker/test/*.test.mjs tests/*.test.mjs tests/*.test.cjs
npm run check --prefix worker
```

Packaging (no deployment) from `worker`:

```sh
XDG_CONFIG_HOME=/tmp/kota-config WRANGLER_SEND_METRICS=false npx wrangler deploy --dry-run --outdir /tmp/kota-final-guard-build
```

Inspect PR51 final-head checks and its PostgreSQL concurrency job. After owner-approved staging promotion and exact fixture configuration, run the existing `Full Kota Connect owner-admin staging acceptance` workflow on the staging branch. Running it on a repair branch is intentionally skipped by its branch guard and is not acceptance. Do not remove the guard to obtain a green run.

**Controlled public beta: INCOMPLETE / HOLD. General production launch: HOLD.**
