# Kota Connect Cloudflare Worker API

This is the **first safe deployment stage**: public approved-shop catalog only. No unauthenticated order creation or private order reads are exposed.

## Deploy to Cloudflare
1. In Cloudflare, authorize Wrangler for your account; from the `worker/` folder run `npm install`.
2. Configure the **Neon development branch** `kota-connect-development`, not the production branch. In Cloudflare Workers add a secret named `DATABASE_URL` containing the Neon development database connection string, or configure Hyperdrive and its `HYPERDRIVE` binding. **Never commit or paste credentials into chat.**
3. Optionally set `ALLOWED_ORIGIN` to `https://siboniisozulu-alt.github.io`.
4. Run `npm run deploy`. Test `GET /health` and `GET /api/shops` (an empty shops array is expected until shops are migrated).
5. Before exposing order/customer endpoints, configure trusted customer identity, owner/admin authorization, input validation, rate limits, audit logging, and atomic order transactions.
6. Only after these tests, update the GitHub Pages frontend to call the deployed Worker URL. No URL has been provisioned yet.

## Security
The frontend is public GitHub Pages. Database credentials belong exclusively in Cloudflare Worker secrets/Hyperdrive bindings. CORS is not authentication. The current API deliberately blocks all writes and private order reads.

## Current database
Neon project `young-bird-19918639`, development branch `kota-connect-development`. Production remains unchanged.

## Admin commission integration
The development Admin Dashboard now has an opt-in Neon commission panel. After deployment, enter the Worker origin in that panel and click **Load Neon commission**.

Configure the following Worker environment values **privately in Cloudflare**:
- `DATABASE_URL` as a Worker secret (development Neon branch only), or a `HYPERDRIVE` binding.
- `ADMIN_UID` as a Worker secret/variable containing the existing Firebase administrator UID. Match the UID configured in the admin dashboard.
- `FIREBASE_PROJECT_ID=kasikota-hub` as a Worker variable.
- `ALLOWED_ORIGIN=https://siboniisozulu-alt.github.io` as a Worker variable.

The endpoint `GET /api/admin/commission` requires `Authorization: Bearer <Firebase ID token>`. The Worker validates the Google Secure Token signature, token issuer, audience, expiry and administrator UID. Do not expose this endpoint without those settings.

The ledger will be empty until authenticated order completion logic populates `kc_commission_entries` and payment recording is implemented. Never represent the empty ledger as evidence of zero Firebase commissions. This is a **read-only commission integration**; no payouts or charges are performed.
