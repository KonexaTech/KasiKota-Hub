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

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    const origin = request.headers.get("origin");
    const allowed = env.ALLOWED_ORIGIN || "https://siboniisozulu-alt.github.io";
    if (origin && origin !== allowed) return json({ error: "Origin not allowed" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "content-type" } });
    if (request.method !== "GET") return json({ error: "Write operations not enabled until authentication is configured" }, 405, headers);
    const path = new URL(request.url).pathname;
    if (path === "/health") return json({ status: "ok", service: "kota-connect-api", database: "not_checked" }, 200, headers);
    try {
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
