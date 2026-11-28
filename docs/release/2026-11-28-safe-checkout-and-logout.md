# Private beta checkout and logout repairs

Baseline: ffab51ae41a7b96de14cbdc299c0529744f2d5fb.

## Reproduced defects

- Routing is deliberately inactive without its provider key, but the customer page
  still offered delivery and the staging API could accept an order that could not
  reach automatic dispatch/completion. A regression using the actual private-mode
  environment reached the database instead of rejecting before a write.
- Sign-in retained the entered password in the form. A Chromium regression reproduced
  that retained value. Sign-out also ignored the SDK error field and could say
  "Signed out" despite failure; it did not clear pending password/verification fields.
- Actual browser acceptance46103394664 passed the real API cases and owner sign-in/
  role checks, then failed at guest discovery because the TEST shop name is beside
  its menu button, not inside that button. This was a selector defect in the new test.

## Changes

- Add a boolean-only private delivery capability. It needs reviewed routing,
  synchronization, callback and dispatch recovery flags plus existing server-only
  credentials/bridge configuration. The endpoint performs no database query and
  never returns secrets. Existing R15/R10 amounts and driver eligibility are unchanged.
- In the actual dedicated private Neon runtime, reject unavailable delivery checkout
  before any database write, even for a forced/stale UI submission. Collection
  remains available. The customer dropdown explains unavailability using the existing
  layout and shows normal approved pricing when configured delivery is available.
- Clear password and verification inputs after successful sign-in and on sign-out.
  Hide private panels while signing out; confirm the server session is absent
  before acknowledging success, even when an SDK reports success with stale state. Failed remote sign-out remains clearly unconfirmed and retryable. This
  is not a claim of immediate revocation of previously issued JWTs.
- Select the exact fresh TEST shop card in live browser acceptance. Assert actual
  delivery availability and cleared form credentials. Correct mock request counters
  to include their role prefix, strengthening existing no-submit assertions.

## Evidence and scope

Targeted server/UI cases and six local-mock Chromium journey groups passed,86API
requests. They include disabled delivery, forced submission denial, successful
collection, secret clearing and failed-sign-out handling for both dashboards.
The new actual browser journey must pass after the final source is deployed; its
previous failed run remains recorded. No failures are hidden or skipped.

No production, database/migration, identity-provider, signing, monetary, navigation
or branding changes. Collection and configured delivery behavior are preserved;
unverified automatic delivery stays unavailable until its prerequisites pass.

## Follow-up actual browser evidence

Run46105734327 passed real owner/admin API acceptance and guest browser checkout,
then failed within the owner lifecycle. The browser attempted consecutive status
actions after the saved-status label updated but before the existing bound action
finished notification refresh and cleared its aria-busy marker. The application's
duplicate-action guard deliberately ignores clicks while kcWorking is true.
The browser now awaits action completion, asserts each actual PATCH returns200,
and checks the persisted-status label for every transition. It uses the dialog's
existing automatic order refresh rather than starting a second overlapping refresh,
and records a distinct safe stage per status without exposing order data.
No application behavior or security guard is changed. A new exact-source live run
remains required; this correction alone does not establish browser PASS.
