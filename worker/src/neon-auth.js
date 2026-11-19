import { createRemoteJWKSet, jwtVerify } from "jose";

/** Verify Neon Auth access tokens using the configured JWKS and issuer. */
const jwksCache = new Map();
export async function verifiedNeonSubject(request, env) {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1];
  const base = (env.NEON_AUTH_BASE_URL || env.NEON_AUTH_URL || "").replace(/\/$/, "");
  const configuredJwks = env.NEON_AUTH_JWKS_URL || (base ? base + "/.well-known/jwks.json" : "");
  if (!token || !base.startsWith("https://") || !configuredJwks.startsWith("https://")) return null;
  try {
    const jwksUrl = new URL(configuredJwks);
    let jwks = jwksCache.get(jwksUrl.href);
    if (!jwks) { jwks = createRemoteJWKSet(jwksUrl); jwksCache.set(jwksUrl.href, jwks); }
    const issuer = new URL(base).origin;
    const { payload } = await jwtVerify(token, jwks, { algorithms: ["EdDSA"], issuer, audience: issuer });
    if (typeof payload.sub !== "string" || !payload.sub || !payload.exp || !payload.iat) return null;
    return payload.sub;
  } catch { return null; }
}
export async function isNeonAdmin(env, withDb, subject) {
  if (!subject) return false;
  return withDb(env, async db => (await db.query("SELECT 1 FROM kc_admins WHERE subject=$1", [subject])).rowCount === 1);
}
