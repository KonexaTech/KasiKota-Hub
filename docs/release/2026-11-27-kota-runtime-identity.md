# Restricted Kota connection enforcement

Baseline private development branch: `9297a5a9c37f0e56ca4f7c018486754f5fefea37`.
The reviewed deployment preflight already verified the main staging role. This
repair also enforces the actual restricted identity on every ordering and delivery
bridge connection, including after any subsequent binding changes.

Reject connection query overrides (`host`, `user`, `dbname`, `options`, etc.) before
connecting. Retain existing TLS parameters. Ordering URL must identify neondb and
kc_staging_worker; delivery must identify neondb and kc_delivery_bridge. Verify the
connected database/role, five privilege flags and privileged role memberships
before running application queries. Existing finally blocks close rejected clients.
No credentials, grants, tables, financial rules, application identity or UI changes.

Evidence: targeted role/config tests passed (six). Full local regression: 163 cases,
162 passed, zero failed, one explicitly skipped without independent PostgreSQL.
The exact identity query also executed successfully through direct authenticated
connections as BOTH existing isolated staging roles: expected database/name; no
superuser, bypass-RLS, role/database creation, replication or privileged membership.
No hosted records or permissions changed by this repair.

Exact-source CI is required before staging integration. Protected deployment,
actual authenticated staging journey and physical Android gates remain separate.
Rollback is the prior reviewed artifact; no data migration or reversal is needed.

The proposed synchronization rollback was also exercised before any hosted
application: a missing terminator was reproduced (42601), corrected, and the
three synchronization/rollback tests passed. Rollback preserves orders and restores
the prior trigger while removing only the new RPC. Proposed migration remains unapplied.
