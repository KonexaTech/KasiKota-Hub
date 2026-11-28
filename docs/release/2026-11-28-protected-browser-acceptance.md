# Protected staging credential binding and browser acceptance

Baseline: feature/neon-only-cutover at1a7beee431cec34b91c8b508e88e2cdaeef4be6f.
On28November the existing guarded deployment46101558014 passed, including pre/post
Access checks, restricted Neon permissions, exact API/Pages source and live health.
The existing real-role acceptance46101717436 then passed with freshly labelled TEST
shop/menu and actual owner/admin sign-in, guest orders, persistence, pickup lifecycle,
role isolation, notifications, rejected orders and paused R0.50/R20 commission rules.
This is real staged API evidence, not browser or physical Android acceptance.

## Changes

- The guarded private deployment optionally binds secrets.KOTA_ROUTING_API_KEY to
  the existing staging Worker through its0600temporary secret file. No key is logged,
  committed, sent to the client, or included when absent/blank. Existing server-side
  secrets are not replaced by an empty value. Other credentials are excluded. This
  does not create an external provider account or enable routing/financial features.
- Fresh-fixture role acceptance now also runs actual protected390px browser journeys:
  no-registration pickup checkout/reload, owner status controls, administrator order
  oversight, real owner/admin sign-in, wrong password/role rejection and logout.
- Browser Access headers are added only to the two fixed private staging origins.
  Public SDK/font assets receive no Access, authorization or cookie headers. Other
  external traffic is blocked. No screenshots, tokens, credentials or page data are
  printed or uploaded. Browser debug logging is disabled for this step.
- Runtime guards require manual staging execution, exact source/Pages markers and a
  shop freshly created with this run marker. Existing merchants are not modified.
  Only an additional labelled test order is created; there are no payments or deletes.
- Existing API-only fixed-fixture mode is preserved. Browser steps require fresh mode.
  Ordinary CI exercises only pure policy/writer tests and browser script syntax, never
  private credentials or hosted fixture writes.

## Verification limits

22 targeted policy, workflow and fresh-fixture cases passed before publication.
The new actual browser journey is NOT VERIFIED until its protected manual workflow
passes against the exact deployed candidate. CI and deployment guards remain intact;
there are no production changes, new paid services, Firebase, navigation or design changes.
