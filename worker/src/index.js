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
async function verifiedUser(request, env) {
  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") || "")?.[1];
  if (!token || !env.NEON_AUTH_JWKS_URL || !env.NEON_AUTH_BASE_URL || token.length > 8192) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "EdDSA" || typeof header.kid !== "string" ||
        typeof claims.sub !== "string" || !claims.sub ||
        claims.iss !== env.NEON_AUTH_BASE_URL ||
        !Number.isFinite(claims.exp) || claims.exp <= now ||
        (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now))) return null;
    const url = new URL(env.NEON_AUTH_JWKS_URL);
    if (url.protocol !== "https:" || url.origin !== new URL(env.NEON_AUTH_BASE_URL).origin) return null;
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const { keys } = await response.json();
    const jwk = keys?.find(k => k.kid === header.kid && k.kty === "OKP" && k.crv === "Ed25519");
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("Ed25519", key, decodeBase64Url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
    return valid ? claims.sub : null;
  } catch { return null; }
}
async function verifiedAdmin(request, env) {
  const uid = await verifiedUser(request, env);
  if (!uid) return false;
  return withDb(env, async db => {
    const r = await db.query("SELECT 1 FROM kc_admins WHERE subject=$1 LIMIT 1", [uid]);
    return r.rowCount === 1;
  });
}

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    const origin = request.headers.get("origin");
    const allowed = env.ALLOWED_ORIGIN || "https://siboniisozulu-alt.github.io";
    if (origin && origin !== allowed) return json({ error: "Origin not allowed" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "access-control-allow-methods": "GET, POST, PATCH, OPTIONS", "access-control-allow-headers": "content-type, authorization" } });
    if (!["GET","POST","PATCH"].includes(request.method)) return json({ error: "Method not allowed" }, 405, headers);
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/health") return json({ status: "ok", service: "kota-connect-api", database: "not_checked" }, 200, headers);
    try {

      if (request.method === "GET" && path === "/api/health/db") {
        // Deliberately omit database error details and connection metadata.
        await withDb(env, db => db.query("SELECT 1 AS ok"));
        return json({ status: "ok", database: "reachable" }, 200, headers);
      }
      if (request.method === "GET" && path === "/api/admin/commission") {
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
      if (request.method === "POST" && path === "/api/shop-applications") {
        const uid = await verifiedUser(request, env);
        if (!uid) return json({ error: "Unauthorized" }, 401, headers);
        let data;
        try { data = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400, headers); }
        const field = (name, max) => typeof data?.[name] === "string" ? data[name].trim().slice(0, max + 1) : "";
        const owner = field("owner_name", 120), shop = field("shop_name", 160);
        const phone = field("phone", 30), area = field("area", 120), address = field("address", 300);
        const description = field("description", 1500);
        if (owner.length < 2 || owner.length > 120 || shop.length < 2 || shop.length > 160 ||
            !phone || phone.length > 30 || !area || area.length > 120 ||
            !address || address.length > 300 || description.length > 1500)
          return json({ error: "Invalid application details" }, 400, headers);
        const result = await withDb(env, db => db.query(
          "INSERT INTO kc_shop_applications(applicant_subject,owner_name,shop_name,phone,area,address,description) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,status,created_at",
          [uid,owner,shop,phone,area,address,description]
        ));
        return json({ application: result.rows[0] }, 201, headers);
      }
      if (request.method === "GET" && path === "/api/my/shop-applications") {
        const uid = await verifiedUser(request, env);
        if (!uid) return json({ error: "Unauthorized" }, 401, headers);
        const result = await withDb(env, db => db.query(
          "SELECT id,shop_name,area,status,created_at,reviewed_at FROM kc_shop_applications WHERE applicant_subject=$1 ORDER BY created_at DESC LIMIT 100", [uid]
        ));
        return json({ applications: result.rows }, 200, headers);
      }
      if (request.method === "GET" && path === "/api/admin/shop-applications") {
        if (!await verifiedAdmin(request, env)) return json({ error: "Unauthorized" }, 401, headers);
        const result = await withDb(env, db => db.query(
          "SELECT id,applicant_subject,owner_name,shop_name,phone,area,address,description,status,created_at FROM kc_shop_applications ORDER BY created_at DESC LIMIT 200"
        ));
        return json({ applications: result.rows }, 200, headers);
      }
      if (request.method === "GET" && path === "/api/notifications") {
        const uid = await verifiedUser(request, env);
        if (!uid) return json({ error: "Unauthorized" }, 401, headers);
        const result = await withDb(env, db => db.query(
          "SELECT id,order_id,kind,title,body,read_at,created_at FROM kc_notifications WHERE recipient_subject=$1 ORDER BY created_at DESC LIMIT 100", [uid]
        ));
        return json({ notifications: result.rows }, 200, headers);
      }
      const notificationRead = /^\/api\/notifications\/([0-9a-f-]{36})\/read$/.exec(path);
      if (request.method === "PATCH" && notificationRead) {
        const uid = await verifiedUser(request, env);
        if (!uid) return json({ error: "Unauthorized" }, 401, headers);
        const result = await withDb(env, db => db.query(
          "UPDATE kc_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND recipient_subject=$2 RETURNING id,read_at",
          [notificationRead[1],uid]
        ));
        if (!result.rowCount) return json({ error: "Not found" }, 404, headers);
        return json({ notification: result.rows[0] }, 200, headers);
      }
      if (request.method === "GET" && path === "/api/admin/orders") {
        if (!await verifiedAdmin(request, env)) return json({ error: "Unauthorized" }, 401, headers);
        const result = await withDb(env, db => db.query(`
          SELECT o.id, o.order_number, o.shop_id, s.name AS shop_name,
            o.status, o.created_at, o.area, o.fulfillment_type,
            o.subtotal_cents, o.delivery_cents, o.total_cents,
            o.test_order
          FROM kc_orders o JOIN kc_shops s ON s.id=o.shop_id
          ORDER BY o.created_at DESC LIMIT 200
        `));
        return json({ orders: result.rows }, 200, headers);
      }
      if (request.method === "GET" && path === "/api/owner/orders") {
        const uid = await verifiedUser(request, env);
        if (!uid) return json({ error: "Unauthorized" }, 401, headers);
        const result = await withDb(env, db => db.query(`
          SELECT o.id, o.order_number, o.shop_id, o.status, o.created_at,
            o.customer_name, o.area, o.fulfillment_type, o.subtotal_cents,
            o.delivery_cents, o.total_cents, o.owner_note, o.delay_minutes
          FROM kc_orders o JOIN kc_shops s ON s.id=o.shop_id
          WHERE s.owner_subject=$1 ORDER BY o.created_at DESC LIMIT 100
        `, [uid]));
        return json({ orders: result.rows }, 200, headers);
      }
      if (request.method === "GET" && path === "/api/shops") {
        const rows = await withDb(env, db => db.query("SELECT id, name, area, address FROM kc_shops WHERE approved = true ORDER BY name LIMIT 100"));
        return json({ shops: rows.rows }, 200, headers);
      }
      const match = /^\/api\/shops\/([0-9a-f-]{36})\/menu$/.exec(path);
      if (request.method === "GET" && match) {
        const rows = await withDb(env, db => db.query("SELECT m.id, m.name, m.price_cents FROM kc_menu_items m JOIN kc_shops s ON s.id=m.shop_id WHERE m.shop_id=$1 AND m.available=true AND s.approved=true ORDER BY m.name LIMIT 100", [match[1]]));
        return json({ items: rows.rows }, 200, headers);
      }
      return json({ error: "Not found" }, 404, headers);
    } catch (error) {
      console.error("Kota Connect API request failed", { path, error: error?.name || "UnknownError" });
      return json({ error: "Database unavailable" }, 503, headers);
    }
  }
};
