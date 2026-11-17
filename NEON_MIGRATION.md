# Kota Connect — Neon PostgreSQL migration

Status: IN PROGRESS. Do not merge until the Neon API and authentication are deployed and verified.

## Existing Neon project
- Project: young-bird-19918639
- Production branch: production (unchanged)
- Isolated development branch: kota-connect-development
- Region: aws-eu-west-2

The development branch has these tables: kc_shops, kc_menu_items, kc_orders, kc_order_items, plus indexes on orders by shop and customer. No live Firebase data was imported or deleted.

## Required secure architecture
GitHub Pages is a static frontend and MUST NOT connect directly to PostgreSQL or contain DATABASE_URL, passwords, or Neon privileged API keys.

Customer web app / Owner dashboard / Admin dashboard
  -> authenticated HTTPS backend (server-side credentials)
  -> Neon PostgreSQL

The backend must:
1. Validate user sessions; separate customer, approved owner and admin roles.
2. List only approved shops and priced available menu items.
3. Validate each cart item against server-side menu prices; calculate subtotal and delivery quote on the server.
4. Place order and order items atomically, enforce quantity bounds, generate a unique order reference.
5. Return only the signed-in customer's orders; never authorize by guessable order number.
6. Restrict owner order views and status changes to their own approved shops, enforce legal transitions, and audit changes.
7. Restrict all-orders reporting to verified administrators.
8. Deliver live updates through authorized polling or authenticated SSE/WebSocket endpoints. Do not promise closed-app push until configured and tested.
9. Keep Neon connection strings and auth secrets server-side. Use environment variables, never commit .env.
10. Preserve Firebase data until an explicit, verified migration with counts and rollback plan.

## Region and hosting constraint
The existing Neon project is in aws-eu-west-2. Neon Functions and Neon Realtime are only supported in specified other regions per installed Neon skill. Use an independent secure backend host compatible with the free-cost target, or explicitly authorize provisioning a supported-region project before using Neon Functions. Do not embed SQL credentials in GitHub Pages.

## Deployment gate
- Choose/activate a secure backend host and identity provider; configure secrets privately.
- Deploy SQL migrations from version-controlled scripts and test on development branch.
- Add API endpoints, frontend calls, role checks and authenticated polling.
- Import shops/menus/owners safely from Firebase with consent and verification.
- Test two customers, two owners, one admin, order creation, pricing, status tracking, access denial, and backups.
- Only after passing tests switch the public site away from Firebase.
