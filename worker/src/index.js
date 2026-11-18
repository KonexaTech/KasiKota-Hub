import { neonApi } from "./neon-api.js";
import { Client } from "pg";

// Neon-only API. Database credentials stay in Worker secrets.
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

function allowedOrigin(origin, env) {
  if (!origin) return null;
  const origins = (env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "https://siboniisozulu-alt.github.io")
    .split(",").map(value => value.trim()).filter(Boolean);
  origins.push("https://kota-connect-neon-staging.pages.dev");
  return origins.includes(origin) ? origin : null;
}

async function withDb(env, callback) {
  const connectionString = env.HYPERDRIVE?.connectionString || env.DATABASE_URL;
  if (!connectionString) throw new Error("Database binding not configured");
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
    const origin = request.headers.get("origin");
    const permittedOrigin = allowedOrigin(origin, env);
    const headers = permittedOrigin ? { "access-control-allow-origin": permittedOrigin, "vary": "Origin" } : {};
    if (origin && !permittedOrigin) return json({ error: "Origin not allowed" }, 403);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: { ...headers, "access-control-allow-methods": "GET, POST, PATCH, OPTIONS", "access-control-allow-headers": "content-type, authorization" } });
    if (!["GET", "POST", "PATCH"].includes(request.method)) return json({ error: "Method not allowed" }, 405, headers);
    const path = new URL(request.url).pathname;
    if (path === "/health" && request.method === "GET") return json({ status: "ok", service: "kota-connect-api", database: "not_checked" }, 200, headers);
    if (!path.startsWith("/api/")) return json({ error: "Not found" }, 404, headers);
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
