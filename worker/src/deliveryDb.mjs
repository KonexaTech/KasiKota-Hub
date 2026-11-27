// Dedicated least-privilege database connection for server-to-server delivery only.
// Never fall back to the main application DATABASE_URL.
export function deliveryDatabaseConnectionString(env) {
  const raw = env.KOTA_DELIVERY_DATABASE_URL;
  if (typeof raw !== "string" || !raw) throw new Error("Dedicated delivery database connection not configured");
  let url;
  try { url = new URL(raw); } catch { throw new Error("Invalid delivery database connection URL"); }
  const expected = String(env.EXPECTED_NEON_HOST || "").toLowerCase();
  const host = url.hostname.toLowerCase();
  const pooled = expected.replace(/^([^.]+)\./, "$1-pooler.");
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !expected.endsWith(".neon.tech") ||
      (host !== expected && host !== pooled) ||
      url.pathname !== "/neondb" ||
      url.username !== "kc_delivery_bridge" ||
      !url.password || url.hash)
    throw new Error("Dedicated delivery database target or role guard failed");
  return raw;
}
