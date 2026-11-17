import { Client } from "pg";

/**
 * Kota Connect's public, read-only catalog API.
 * Add authenticated owner/customer/admin endpoints only after identity verification is configured.
 * DATABASE_URL is a Worker secret; never place it in GitHub Pages or this repository.
 */
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

function allowedOrigin(origin, env) {
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "https://siboniisozulu-alt.github.io")
    .split(",").map(value => value.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}
function cors(request, env) {
  const origin = request.headers.get("origin");
  const allowed = allowedOrigin(origin, env);
  return allowed ? { "access-control-allow-origin": allowed, "vary": "Origin" } : {};
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
    if (origin && !allowedOrigin(origin, env)) return json({ error: "Origin not allowed" }, 403);
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
        return json({ enabled: false, phase: "launch", message: "Commission is disabled for the launch phase." }, 200, headers);
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
      const approval = /^\/api\/admin\/shop-applications\/([0-9a-f-]{36})\/decision$/.exec(path);
      if (request.method === "PATCH" && approval) {
        if (!await verifiedAdmin(request, env)) return json({ error: "Unauthorized" }, 401, headers);
        const admin = await verifiedUser(request, env);
        let data;
        try { data = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400, headers); }
        if (!["approved","rejected"].includes(data?.decision)) return json({ error: "Invalid decision" }, 400, headers);
        const result = await withDb(env, async db => {
          await db.query("BEGIN");
          try {
            const application = await db.query("UPDATE kc_shop_applications SET status=$1,reviewed_by_subject=$2,reviewed_at=now() WHERE id=$3 AND status='pending' RETURNING *",
              [data.decision,admin,approval[1]]);
            if (!application.rowCount) { await db.query("ROLLBACK"); return { status:409,error:"Application not pending" }; }
            const a = application.rows[0];
            if (data.decision === "approved") {
              await db.query("INSERT INTO kc_shops(owner_subject,name,area,address,phone,approved) VALUES ($1,$2,$3,$4,$5,true)",
                [a.applicant_subject,a.shop_name,a.area,a.address,a.phone]);
            }
            await db.query("INSERT INTO kc_notifications(recipient_subject,kind,title,body) VALUES ($1,'application_status',$2,$3)",
              [a.applicant_subject,"Shop application "+data.decision,"Your application for "+a.shop_name+" was "+data.decision]);
            await db.query("COMMIT");
            return { application:{ id:a.id,status:data.decision } };
          } catch (error) { await db.query("ROLLBACK").catch(() => {}); throw error; }
        });
        return json(result.status ? { error:result.error } : result,result.status || 200,headers);
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
      if (request.method === "POST" && path === "/api/orders") {
        const uid = await verifiedUser(request, env);
        if (!uid) return json({ error: "Unauthorized" }, 401, headers);
        let data;
        try { data = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400, headers); }
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const items = data?.items;
        const customerName = typeof data?.customer_name === "string" ? data.customer_name.trim() : "";
        const customerPhone = typeof data?.customer_phone === "string" ? data.customer_phone.trim() : "";
        const area = typeof data?.area === "string" ? data.area.trim() : "";
        const deliveryAddress = typeof data?.delivery_address === "string" ? data.delivery_address.trim() : "";
        const fulfillment = data?.fulfillment_type;
        if (!uuid.test(data?.shop_id || "") || !Array.isArray(items) || items.length < 1 || items.length > 25 ||
            items.some(i => !uuid.test(i?.menu_item_id || "") || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 50) ||
            new Set(items.map(i => i.menu_item_id)).size !== items.length ||
            customerName.length < 2 || customerName.length > 120 || customerPhone.length < 5 || customerPhone.length > 30 ||
            !area || area.length > 120 || !["pickup","delivery"].includes(fulfillment) ||
            (fulfillment === "delivery" && (!deliveryAddress || deliveryAddress.length > 300)) ||
            deliveryAddress.length > 300)
          return json({ error: "Invalid order details" }, 400, headers);
        const result = await withDb(env, async db => {
          await db.query("BEGIN");
          try {
            const shop = await db.query("SELECT id,owner_subject,area FROM kc_shops WHERE id=$1 AND approved=true", [data.shop_id]);
            if (!shop.rowCount) { await db.query("ROLLBACK"); return { error: "Shop unavailable", status: 404 }; }
            const ids = items.map(i => i.menu_item_id);
            const menu = await db.query(
              "SELECT id,name,price_cents FROM kc_menu_items WHERE shop_id=$1 AND available=true AND id=ANY($2::uuid[]) FOR SHARE",
              [data.shop_id,ids]
            );
            if (menu.rowCount !== items.length) { await db.query("ROLLBACK"); return { error: "Menu item unavailable", status: 400 }; }
            const byId = new Map(menu.rows.map(m => [m.id,m]));
            const subtotal = items.reduce((sum,i) => sum + byId.get(i.menu_item_id).price_cents * i.quantity,0);
            if (!Number.isSafeInteger(subtotal) || subtotal <= 0 || subtotal > 10000000) {
              await db.query("ROLLBACK"); return { error: "Order total exceeds limit", status: 400 };
            }
            // Delivery pricing is not configured yet: do not accept an unverified delivery quote.
            if (fulfillment === "delivery") { await db.query("ROLLBACK"); return { error: "Delivery checkout not yet enabled", status: 409 }; }
            const number = "KC-" + crypto.randomUUID();
            const order = await db.query(
              "INSERT INTO kc_orders(order_number,shop_id,customer_subject,customer_name,customer_phone,area,delivery_address,fulfillment_type,status,subtotal_cents,delivery_cents,total_cents,test_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,0,$9,false) RETURNING id,order_number,status,total_cents,created_at",
              [number,data.shop_id,uid,customerName,customerPhone,area,deliveryAddress || null,fulfillment,subtotal]
            );
            for (const item of items) {
              const m = byId.get(item.menu_item_id);
              await db.query("INSERT INTO kc_order_items(order_id,menu_item_id,item_name,unit_price_cents,quantity) VALUES ($1,$2,$3,$4,$5)",
                [order.rows[0].id,m.id,m.name,m.price_cents,item.quantity]);
            }
            await db.query("INSERT INTO kc_order_status_events(order_id,previous_status,new_status,actor_subject,actor_role) VALUES ($1,NULL,'pending',$2,'customer')",[order.rows[0].id,uid]);
            await db.query("INSERT INTO kc_notifications(recipient_subject,order_id,kind,title,body) VALUES ($1,$2,'new_order','New kota order',$3)",
              [shop.rows[0].owner_subject,order.rows[0].id,"Order "+order.rows[0].order_number]);
            await db.query("COMMIT");
            return { order: order.rows[0] };
          } catch (error) { await db.query("ROLLBACK").catch(() => {}); throw error; }
        });
        return json(result.status ? { error: result.error } : result, result.status || 201, headers);
      }
      if (request.method === "GET" && path === "/api/my/orders") {
        const uid = await verifiedUser(request, env);
        if (!uid) return json({ error: "Unauthorized" }, 401, headers);
        const result = await withDb(env, db => db.query(
          "SELECT id,order_number,shop_id,status,subtotal_cents,delivery_cents,total_cents,created_at,updated_at FROM kc_orders WHERE customer_subject=$1 ORDER BY created_at DESC LIMIT 100", [uid]
        ));
        return json({ orders: result.rows }, 200, headers);
      }
      const shopMenuWrite = /^\/api\/owner\/shops\/([0-9a-f-]{36})\/menu$/.exec(path);
      if (request.method === "POST" && shopMenuWrite) {
        const uid = await verifiedUser(request, env);
        if (!uid) return json({ error: "Unauthorized" }, 401, headers);
        let data;
        try { data = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400, headers); }
        const name = typeof data?.name === "string" ? data.name.trim() : "";
        if (name.length < 2 || name.length > 160 || !Number.isInteger(data?.price_cents) ||
            data.price_cents < 1 || data.price_cents > 1000000)
          return json({ error: "Invalid menu item" }, 400, headers);
        const result = await withDb(env, db => db.query(
          "INSERT INTO kc_menu_items(shop_id,name,price_cents) SELECT id,$1,$2 FROM kc_shops WHERE id=$3 AND owner_subject=$4 AND approved=true RETURNING id,name,price_cents",
          [name,data.price_cents,shopMenuWrite[1],uid]
        ));
        if (!result.rowCount) return json({ error: "Shop not found" }, 404, headers);
        return json({ item:result.rows[0] }, 201, headers);
      }
      const menuEdit = /^\/api\/owner\/menu-items\/([0-9a-f-]{36})$/.exec(path);
      if (request.method === "PATCH" && menuEdit) {
        const uid = await verifiedUser(request, env);
        if (!uid) return json({ error: "Unauthorized" }, 401, headers);
        let data;
        try { data = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400, headers); }
        if (typeof data?.available !== "boolean" || Object.keys(data).some(k => k !== "available"))
          return json({ error: "Only availability can be updated" }, 400, headers);
        const result = await withDb(env, db => db.query(
          "UPDATE kc_menu_items m SET available=$1 FROM kc_shops s WHERE m.id=$2 AND m.shop_id=s.id AND s.owner_subject=$3 RETURNING m.id,m.available",
          [data.available,menuEdit[1],uid]
        ));
        if (!result.rowCount) return json({ error:"Not found" },404,headers);
        return json({ item:result.rows[0] },200,headers);
      }
      if (request.method === "GET" && path === "/api/owner/shops") {
        const uid = await verifiedUser(request, env);
        if (!uid) return json({ error: "Unauthorized" }, 401, headers);
        const result = await withDb(env, db => db.query(
          "SELECT id,name,area,address,approved FROM kc_shops WHERE owner_subject=$1 ORDER BY created_at DESC", [uid]
        ));
        return json({ shops:result.rows }, 200, headers);
      }
      const orderDetail = /^\/api\/orders\/([0-9a-f-]{36})$/.exec(path);
      if (request.method === "GET" && orderDetail) {
        const uid = await verifiedUser(request, env);
        if (!uid) return json({ error: "Unauthorized" }, 401, headers);
        const result = await withDb(env, async db => {
          const order = await db.query(
            "SELECT o.id,o.order_number,o.shop_id,s.name AS shop_name,o.status,o.customer_name,o.fulfillment_type,o.area,o.subtotal_cents,o.delivery_cents,o.total_cents,o.owner_note,o.created_at,o.updated_at FROM kc_orders o JOIN kc_shops s ON s.id=o.shop_id WHERE o.id=$1 AND (o.customer_subject=$2 OR s.owner_subject=$2 OR EXISTS (SELECT 1 FROM kc_admins WHERE subject=$2))",
            [orderDetail[1],uid]
          );
          if (!order.rowCount) return null;
          const items = await db.query("SELECT item_name,unit_price_cents,quantity FROM kc_order_items WHERE order_id=$1",[orderDetail[1]]);
          const history = await db.query("SELECT previous_status,new_status,note,created_at FROM kc_order_status_events WHERE order_id=$1 ORDER BY created_at ASC",[orderDetail[1]]);
          return { ...order.rows[0],items:items.rows,history:history.rows };
        });
        if (!result) return json({ error:"Not found" },404,headers);
        return json({ order:result },200,headers);
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
      const statusMatch = /^\/api\/owner\/orders\/([0-9a-f-]{36})\/status$/.exec(path);
      if (request.method === "PATCH" && statusMatch) {
        const uid = await verifiedUser(request, env);
        if (!uid) return json({ error: "Unauthorized" }, 401, headers);
        let data;
        try { data = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400, headers); }
        const next = data?.status;
        const allowed = ["accepted","preparing","ready_for_collection","out_for_delivery","completed","rejected","delayed"];
        const note = typeof data?.note === "string" ? data.note.trim() : "";
        if (!allowed.includes(next) || note.length > 500) return json({ error: "Invalid status" }, 400, headers);
        const result = await withDb(env, async db => {
          await db.query("BEGIN");
          try {
            const existing = await db.query(
              "SELECT o.id,o.status,o.customer_subject,o.order_number FROM kc_orders o JOIN kc_shops s ON s.id=o.shop_id WHERE o.id=$1 AND s.owner_subject=$2 FOR UPDATE OF o",
              [statusMatch[1],uid]
            );
            if (!existing.rowCount) { await db.query("ROLLBACK"); return { status:404,error:"Not found" }; }
            const current = existing.rows[0];
            const transitions = { pending:["accepted","rejected","delayed"],delayed:["accepted","rejected"],accepted:["preparing","rejected","delayed"],preparing:["ready_for_collection","out_for_delivery","delayed"],ready_for_collection:["completed"],out_for_delivery:["completed"] };
            if (!transitions[current.status]?.includes(next)) { await db.query("ROLLBACK"); return { status:409,error:"Invalid status transition" }; }
            await db.query("UPDATE kc_orders SET status=$1,owner_note=$2,updated_at=now() WHERE id=$3",[next,note,current.id]);
            await db.query("INSERT INTO kc_order_status_events(order_id,previous_status,new_status,actor_subject,actor_role,note) VALUES ($1,$2,$3,$4,'owner',$5)",[current.id,current.status,next,uid,note]);
            await db.query("INSERT INTO kc_notifications(recipient_subject,order_id,kind,title,body) VALUES ($1,$2,'order_status',$3,$4)",
              [current.customer_subject,current.id,"Order "+current.order_number+" updated","Status: "+next]);
            await db.query("COMMIT");
            return { order: { id:current.id,status:next } };
          } catch (error) { await db.query("ROLLBACK").catch(() => {}); throw error; }
        });
        return json(result.status ? { error:result.error } : result,result.status || 200,headers);
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
      return json({ error: "Service temporarily unavailable" }, 503, headers);
    }
  }
};
