import { Client } from "pg";

/**
 * Kota Connect's public, read-only catalog API.
 * Add authenticated owner/customer/admin endpoints only after identity verification is configured.
 * DATABASE_URL is a Worker secret; never place it in GitHub Pages or this repository.
 */
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

function cors(request, env) {
  const origin = request.headers.get("origin");
  const allowed = env.ALLOWED_ORIGIN || "https://siboniisozulu-alt.github.io";
  return origin === allowed ? { "access-control-allow-origin": allowed, "vary": "Origin" } : {};
}

async function withDb(env, callback) {
  if (!env.DATABASE_URL && !env.HYPERDRIVE) throw new Error("Database binding not configured");
  const client = new Client({ connectionString: env.HYPERDRIVE?.connectionString || env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try { await client.connect(); return await callback(client); }
  finally { await client.end().catch(() => {}); }
}


const decodeBase64Url = input => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), c => c.charCodeAt(0));
};
async function verifiedAdmin(request, env) {
  const token = /^Bearer (\\S+)$/.exec(request.headers.get("authorization") || "")?.[1];
  if (!token || !env.ADMIN_UID || !env.FIREBASE_PROJECT_ID) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
  } catch { return false; }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== "RS256" || typeof header.kid !== "string" ||
      claims.aud !== env.FIREBASE_PROJECT_ID ||
      claims.iss !== "https://securetoken.google.com/" + env.FIREBASE_PROJECT_ID ||
      claims.sub !== env.ADMIN_UID || !claims.sub ||
      !Number.isFinite(claims.exp) || claims.exp <= now ||
      !Number.isFinite(claims.iat) || claims.iat > now ||
      !Number.isFinite(claims.auth_time) || claims.auth_time > now) return false;
  try {
    const response = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    if (!response.ok) return false;
    const { keys } = await response.json();
    const jwk = keys?.find(key => key.kid === header.kid && key.kty === "RSA" && key.use === "sig");
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64Url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  } catch { return false; }
}

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    const origin = request.headers.get("origin");
    const allowed = env.ALLOWED_ORIGIN || "https://siboniisozulu-alt.github.io";
    if (origin && origin !== allowed) return json({ error: "Origin not allowed" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "content-type, authorization" } });
    if (request.method !== "GET") return json({ error: "Write operations not enabled until authentication is configured" }, 405, headers);
    const path = new URL(request.url).pathname;
    if (path === "/health") return json({ status: "ok", service: "kota-connect-api", database: "not_checked" }, 200, headers);
    try {

      if (path === "/api/health/db") {
        // Deliberately omit database error details and connection metadata.
        await withDb(env, db => db.query("SELECT 1 AS ok"));
        return json({ status: "ok", database: "reachable" }, 200, headers);
      }
      if (path === "/api/admin/commission") {
        if (!await verifiedAdmin(request, env)) return json({ error: "Unauthorized" }, 401, headers);
        const result = await withDb(env, db => db.query(`
          SELECT s.id AS shop_id, s.name AS shop_name,
            COUNT(e.id)::integer AS eligible_orders,
            COALESCE(SUM(e.amount_cents),0)::integer AS earned_cents,
            COALESCE((SELECT SUM(p.amount_cents) FROM kc_commission_payments p WHERE p.shop_id=s.id),0)::integer AS paid_cents
          FROM kc_shops s
          LEFT JOIN kc_commission_entries e ON e.shop_id=s.id
          GROUP BY s.id,s.name
          ORDER BY s.name LIMIT 1000
        `));
        const shops = result.rows.map(row => ({
          ...row,
          outstanding_cents: Math.max(0, row.earned_cents - row.paid_cents),
          remaining_to_threshold_cents: Math.max(0, 2000 - (row.earned_cents - row.paid_cents))
        }));
        return json({
          source: "neon_ledger",
          commission_per_order_cents: 50,
          payout_threshold_cents: 2000,
          eligible_orders: shops.reduce((sum, shop) => sum + shop.eligible_orders, 0),
          earned_cents: shops.reduce((sum, shop) => sum + shop.earned_cents, 0),
          paid_cents: shops.reduce((sum, shop) => sum + shop.paid_cents, 0),
          outstanding_cents: shops.reduce((sum, shop) => sum + shop.outstanding_cents, 0),
          shops
        }, 200, headers);
      }
      if (path === "/api/shops") {
        const rows = await withDb(env, db => db.query("SELECT id, name, area, address FROM kc_shops WHERE approved = true ORDER BY name LIMIT 100"));
        return json({ shops: rows.rows }, 200, headers);
      }
      const match = /^\/api\/shops\/([0-9a-f-]{36})\/menu$/.exec(path);
      if (match) {
        const rows = await withDb(env, db => db.query("SELECT m.id, m.name, m.price_cents FROM kc_menu_items m JOIN kc_shops s ON s.id=m.shop_id WHERE m.shop_id=$1 AND m.available=true AND s.approved=true ORDER BY m.name LIMIT 100", [match[1]]));
        return json({ items: rows.rows }, 200, headers);
      }
      return json({ error: "Not found" }, 404, headers);
    } catch (error) {
      console.error("Catalog API failed", error.message);
      return json({ error: "Database unavailable" }, 503, headers);
    }
  }
};
