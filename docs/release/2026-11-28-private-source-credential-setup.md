# Initialize private Delivery source credentials without exposing them

The existing protected Kota Actions environment already holds the service identity
authorized for Kota's private API. Delivery needs that identity to make its
reviewed source-order, source-account and signed-callback requests through Access.
The corresponding Delivery sourceTransport repair is PR38.

Add an explicitly selected step to the existing exact-source staging deployment
workflow. It uses the protected environment, fixed Cloudflare account/project and
a full expected Delivery source SHA. Before any mutation it checks both current
owner/service Access policies, Delivery's canonical successful staging deployment,
repository1467163423, fixed staging branch, hostname, database host and opaque
secret types. It refuses to replace either binding if already present.

Only KOTA_SOURCE_CF_ACCESS_CLIENT_ID and KOTA_SOURCE_CF_ACCESS_CLIENT_SECRET are
upserted as secret_text into konexa-delivery-private-staging. Pages calls this its
production deployment configuration, but the project and branch are private
staging; no production application or database is targeted. Other bindings,
opaque HMAC/PIN/source secrets and configuration hash are preserved. The Pages API
PATCH semantics are per-key upserts (deletion requires null), matching the installed
Wrangler pages secret put/bulk implementation. No secret values or API bodies are
logged or returned to a browser. No Access policy or Auth role is changed.

The step is off by default. After exact-source CI and review, select
configure_delivery_source_access=true with the exact expected_delivery_source.
Run it before merging Delivery PR38 so the next reviewed Delivery deployment
receives both bindings. Subsequent deployments leave this option false.
The role-acceptance workflow also accepts an explicit expected_delivery_source;
requested health checks reject malformed/mismatched SHA values rather than
trusting whichever version happens to be live.

Regression:5 policy/orchestration cases and9 existing workflow/auth safety cases
pass. Fixture API execution verifies one fixed-target two-secret upsert, no
mutation without explicit opt-in, preservation and redacted logs. These fixture
results are not an actual secret configuration or live integration PASS.

Rollback, if needed: keep integration disabled; remove only the two newly created
bindings through a reviewed staging-only per-key null update and redeploy the
previous reviewed Delivery candidate. Never replace the opaque source JSON,
rotate existing credentials, delete records or modify production. Existing
signing, branding, prices, data and navigation are unchanged; no paid service,
Firebase, payment or payout is introduced.
