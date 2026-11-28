# Protected Delivery health acceptance from Kota staging

Baseline d0a71a9f4be15c94129a5c03586e55e95c703845. No production changes.

## Minimal change

The existing Delivery Access policy already authorizes the service identity held
in Kota's server-only DELIVERY_CF_ACCESS_CLIENT_ID/SECRET bindings. Reuse it for
an administrator-only read-only GET /api/admin/delivery-health diagnostic. Do not
create credentials, alter Access policies, change Auth roles, or enable dispatch.
The endpoint pins both staging origins and the fixed /v1/health path, rejects
redirects/misconfiguration, uses a timeout and returns only validated readiness,
source SHA and payments-disabled status. Incoming bearer/cookie values and raw
upstream content are never forwarded/returned. Existing verified-account and
kc_admins checks are mandatory. Driver/admin application acceptance is separate.

The current guarded real-role workflow has an optional verify_delivery_health
input, false by default. When selected it requires live HTTP200/ready schema and
exact reviewed Delivery source2c415551214d6ba9b4140305417d41fac14f8723, and verifies
owner/anonymous denial. Failure is fatal to that requested acceptance run.

## Evidence before publication

The new signed-JWT authorization/transport regression failed404 before the change
and passes after it. It covers admin/owner/unverified/guest/anonymous identities,
wrong environment/host/target, missing service credential, invalid or incomplete
readiness, enabled payments, redirects, transport failure and secret redaction.
Worker check:70 cases,69passed,0failed,1local PostgreSQL skip. Workflow/fixture/
transport policy tests11/11 pass. Exact-source CI, clean Pages build, private
deployment and requested live health acceptance are still required before PASS.
Local Pages build correctly refuses an uncommitted source tree; no guard bypass.

## Rollback

Revert this isolated change or redeploy reviewed d0a71a9 using the existing guarded
private workflow. No migration, data cleanup, credential rotation or Access change
is involved. Keep unverified routing/dispatch features disabled; R15/R10/R5 stays
unchanged. No notifications provider, Firebase, paid service, UI or Android
identity/signing change is introduced.
