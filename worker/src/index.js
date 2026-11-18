import { neonApi } from "./neon-api.js";
import { Client } from "pg";

// Neon-only staging API. DATABASE_URL must be a server-side Worker secret.
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

function cors(request, env) {
  const origin = request.headers.get("origin");
  const allowed = [env.ALLOWED_ORIGIN || "https://siboniisozulu-alt.github.io", "https://kota-connect-neon-staging.pages.dev"];
  return allowed.includes(origin) ? { "access-control-allow-origin": origin, "vary": "Origin" } : {};
}

async function withDb(env, callback) {
  if (!env.DATABASE_URL && !env.HYPERDRIVE) throw new Error("Database binding not configured");
  // This staging Worker must never connect to a different Neon branch.
  const connectionString = env.HYPERDRIVE?.connectionString || env.DATABASE_URL;
  if (!env.EXPECTED_NEON_HOST) throw new Error("Expected development database host not configured");
  let hostname;
  try { hostname = new URL(connectionString).hostname.toLowerCase(); }
  catch { throw new Error("Invalid database connection URL"); }
  if (hostname !== env.EXPECTED_NEON_HOST.toLowerCase())
    throw new Error("Database target does not match development branch");
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  try { await client.connect(); return await callback(client); }
  finally { await client.end().catch(() => {}); }
}

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    const origin = request.headers.get("origin");
    const allowed = [env.ALLOWED_ORIGIN || "https://siboniisozulu-alt.github.io", "https://kota-connect-neon-staging.pages.dev"];
    if (origin && !allowed.includes(origin)) return json({ error: "Origin not allowed" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "access-control-allow-methods": "GET, POST, PATCH, OPTIONS", "access-control-allow-headers": "content-type, authorization" } });
    const path = new URL(request.url).pathname;
    if (path === "/health" && request.method === "GET") return json({ status: "ok", service: "kota-connect-api", database: "not_checked" }, 200, headers);
    if (!path.startsWith("/api/")) return json({ error: "Not found" }, 404, headers);
    // Fail closed if a deployment accidentally omits Neon-only mode.
    if (env.NEON_ONLY_MODE !== "true") return json({ error: "Neon-only mode not configured" }, 503, headers);
    try {
      const response = await neonApi(request, env, withDb);
      if (!response) return json({ error: "Not found" }, 404, headers);
      const result = new Response(response.body, response);
      Object.entries(headers).forEach(([key, value]) => result.headers.set(key, value));
      return result;
    } catch (error) {
      console.error("Neon API request failed", { path, type: error?.name || "UnknownError" });
      return json({ error: "API unavailable" }, 503, headers);
    }
  }
};
