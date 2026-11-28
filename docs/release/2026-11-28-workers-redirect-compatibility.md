# Repair outbound requests in the deployed Workers runtime

Baseline85df89d76bcbca9cfdcb30e175bb280d92391538. The live Delivery diagnostic
failed503 with transport_or_invalid_response; Access logs recorded no Delivery
request. Cloudflare documents that redirect:error throws immediately in Workers:
https://developers.cloudflare.com/workers/runtime-apis/request/

The new health probe used that unsupported mode, as did the existing cycling and
signed-dispatch transports. Switch those three runtime calls to redirect:manual.
Keep existing strict successful-status checks: routing rejects non-success,
health requires200/validated readiness, dispatch accepts only200/201 with a valid
acknowledgement. Every3xx remains rejected; credentials never follow redirects.
Node-only deployment scripts are unaffected.

New workerd regression executes actual production cycling and health functions
inside the locked Miniflare/workerd runtime with synthetic upstream responses.
It failed503 before the repair and passes after it, including redirect denial.
Wire it into Worker and CI checks. This is runtime-compatibility evidence, not
successful actual routing, driver acceptance or physical Android testing.
Existing signed-dispatch PostgreSQL fixture tests retain signature/credential/
idempotency checks and add explicit302 rejection with no committed job pin.

No migration, credential, Access/Auth policy, price, eligibility, interface,
Firebase, infrastructure service or production change. The owner key is still
required for live provider acceptance. Rollback is a guarded staging redeploy of
85df89d; because that restores the known outbound defect, leave unverified delivery
disabled if rollback is necessary. Pickup is unaffected.
