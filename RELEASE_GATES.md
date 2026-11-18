# Kota Connect six release gates — Neon staging

This branch targets only the isolated `kota-connect-api-dev` Cloudflare Worker and the Neon development database. It does not deploy the public GitHub Pages frontend or alter Firebase/production records.

## Changes in this branch

- Customer order creation validates the approved shop and available menu items, calculates prices from the database, writes order + items + initial status event + owner notification in one transaction.
- Owner order list is scoped by the authenticated owner's shop ownership. The status endpoint locks the order row, checks ownership, validates allowed transitions, writes the new status/history/notification in one transaction.
- Owner status updates now persist delay minutes when status is `delayed`.
- Customer order detail is scoped to the customer subject, owning shop subject, or verified admin; it returns order items and full status history.
- Admin order list requires a subject present in `kc_admins` and returns customer/order details, items and status history.
- Staging test page defaults to the deployed development Worker and refreshes active customer tracking, owner orders, admin orders and notifications every five seconds.
- Integration test script covers create → owner receives → accepted → preparing → ready → completed → customer tracking/history/notifications → admin full visibility → cross-customer/cross-owner/unauthenticated denial.

## Run staging integration acceptance

Use a disposable staging shop and menu item. Configure these as local environment variables or GitHub Actions secrets; never paste access tokens into chat or commit them:

- `KOTA_API_BASE=https://kota-connect-api-dev.siboniisozulu.workers.dev`
- `KOTA_TEST_CUSTOMER_TOKEN` — customer account that will create the order
- `KOTA_TEST_OTHER_CUSTOMER_TOKEN` — a different customer
- `KOTA_TEST_OWNER_TOKEN` — owner of `KOTA_TEST_SHOP_ID`
- `KOTA_TEST_OTHER_OWNER_TOKEN` — owner of a different shop
- `KOTA_TEST_ADMIN_TOKEN` — identity already bootstrapped in `kc_admins`
- `KOTA_TEST_SHOP_ID` — approved staging shop UUID
- `KOTA_TEST_MENU_ITEM_ID` — available menu item UUID belonging to that shop

Run:

```sh
cd worker
npm install
npm run check
npm run test:integration
```

The integration test creates one pickup order in the development database and completes it. It does not delete test users, shops, menu items or orders.

## Acceptance status

Code changes and automated test coverage are committed, but the end-to-end script is **not considered passed until run with the staging test identities and disposable shop/menu fixtures**. A deployment job must also complete successfully before runtime acceptance.

The public site still uses the legacy Firebase frontend. Do not call the six gates complete for public customers until the Neon staging UI is accepted and the production frontend migration is separately reviewed and deployed. Firebase Firestore rules were not found in this repository, so no claim is made that the existing Firebase production path passes tenant-isolation tests.

Delivery checkout remains disabled in the Neon API until delivery pricing and coverage are verified; the integration gate tests pickup. Background Android push is not included; in-app notifications are stored and polled while the staging page is open.
