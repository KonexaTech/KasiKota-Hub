# Private staging cycling-provider acceptance

The routing secret binding is present, but this does not prove that the provider accepts it. A verified staging administrator can now request GET /api/admin/routing-health. The server sends one fixed synthetic-coordinate request to the existing cycling provider and returns only a positive integer distance or a generic unavailable response. Owner, guest and anonymous access remain denied; no customer locations, provider error bodies or credentials are returned. The endpoint rejects other hosts and non-staging mode.

The protected role-acceptance workflow adds optional verify_routing (default false). When requested, a provider failure fails acceptance; it is never silently skipped. Delivery activation, pricing and production remain unchanged.

Validation: Worker suite 77 cases, 76 passed, zero failed, one local PostgreSQL prerequisite skipped. Focused regression verifies administrator authorization, fixed endpoint/body, wrong-environment denial and upstream failure privacy. Live provider success remains unverified until the deployed exact-source acceptance completes. Rollback: revert this isolated diagnostic and optional acceptance step; no database changes.
