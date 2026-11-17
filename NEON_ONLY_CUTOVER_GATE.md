# Kota Connect — Neon-only backend cutover gate

Status: **DEVELOPMENT ONLY — NOT APPROVED FOR PUBLIC CUTOVER**.

## Target architecture
- Frontend: existing GitHub Pages site, unchanged until replacement is tested.
- Database: Neon PostgreSQL `kota-connect-development` for staging, then separately approved production.
- Identity: Neon Auth (Managed Better Auth), enabled on development branch on 2026-11-17.
- API: Cloudflare Worker with secret-bound Neon PostgreSQL connection. Never put connection strings in GitHub Pages.
- Customer/owner/admin data and commissions: Neon PostgreSQL only after cutover.
- Background notifications: separate implementation and real-device acceptance needed.

## Neon Auth staging configuration
- Auth base URL: `https://ep-lively-leaf-za5rtfhs.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth`
- Email/password enabled, sign-up enabled.
- **Not** configured or verified for the public site; no existing Firebase identities migrated.
- Never treat a browser-provided owner/admin role as authoritative. The API must verify Neon Auth tokens and map roles to Neon tables.

## Current blockers
1. Replace Firebase browser authentication in customer, owner, and admin pages with Neon Auth, preserving existing accounts through an approved migration/re-enrollment strategy.
2. Replace Firebase shop/menu/order reads and writes with Cloudflare endpoints backed by Neon.
3. Implement authenticated checkout, server-side price recalculation, ownership checks, status transitions and idempotency.
4. Migrate and reconcile existing Firebase shops, menu items and orders; verify row counts and ownership before switching.
5. Deploy and configure a **separate staging Worker** with secrets; test database connection and negative authorization cases.
6. Verify customer order → owner notification/status → customer tracking → admin monitoring → R0.50 commission.
7. Verify rollback and recovery, mobile behavior, accessibility, security, and operational alerts.

## Safety gate
Do not delete Firebase records, disable working Firebase sign-in, or point production at a staging database. Do not claim a Neon-only launch until all required tests pass.
