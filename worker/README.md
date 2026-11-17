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
