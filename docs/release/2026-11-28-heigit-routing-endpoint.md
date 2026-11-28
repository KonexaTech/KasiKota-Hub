# Restore compatibility with the routing provider's current endpoint

The existing cycling adapter still used api.openrouteservice.org. The provider's
28 April2026 announcement deprecates that hostname, names api.heigit.org as its
replacement and schedules the old hostname's closure for2–6November2026:
https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912

Minimal correction: pin the existing POST cycling-regular/json request to
https://api.heigit.org/openrouteservice/v2/directions/cycling-regular/json.
Keep the existing provider, server-only API key, coordinates-only body, redirect
rejection, timeout, distance validation, R15/R10 staging amounts and eligibility.
No additional distance band or maximum weight is invented. No straight-line
fallback, live payment, Firebase, new paid service or production change.

Regression: the strengthened cycling test rejects the deprecated hostname before
the repair (4pass/1fail), and all5 routing tests pass after it. The PostgreSQL GPS
checkout case now asserts the current provider URL and unchanged pricing/retry
behavior. Include these routing unit cases in both Worker and CI regression.
Actual successful routing is still BLOCKED until the owner's key is configured;
mocked provider responses are not actual travel-distance evidence.

The owner can retrieve/create a free key at https://account.heigit.org/ and add
KOTA_ROUTING_API_KEY at
https://github.com/KonexaTech/KasiKota-Hub/settings/secrets/actions .
Keys remain server-side; never paste them into chat, Git or client bundles.
The existing guarded staging deployment consumes that optional secret without
clobbering an existing binding with an absent value. Activation remains separate
and requires trusted route and actual driver/integration acceptance.

Rollback: revert only this URL/test change or redeploy the preceding reviewed
private staging source. No migration, data deletion, Access-policy modification
or credential rotation is needed. The old endpoint is deprecated, so keep delivery
unavailable if rollback is required. Existing customer collection remains usable.

A requested live Delivery health run46110997967 failed503. Direct restricted-role
catalog checks and Hyperdrive metadata match the correct staging database/role;
the hosted failure is not yet diagnosed. Add fixed, sanitized failure categories
to the admin-only probe and strict acceptance log, including only whitelisted
upstream health stages. Regression verifies that an upstream secret field is
never returned. This makes transport/Access/runtime failures distinguishable;
it does not change any successful status assertion or certify health.
