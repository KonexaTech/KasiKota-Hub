// Development staging proxy. Protect Neon-managed session cookies on the app's own origin.
// This is not the customer production app and does not contain database credentials.
const API_UPSTREAM = "https://kota-connect-api-dev.siboniisozulu.workers.dev";
const AUTH_UPSTREAM = "https://ep-lively-leaf-za5rtfhs.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function stageCookie(raw) {
  // Cookies issued for the Neon host must belong to this Pages host instead.
  // Keep HttpOnly and Secure; never turn a session cookie into a JS-readable cookie.
  return raw.split(";").filter((part) => !/^\s*(?:domain|partitioned)(?:=|$)/i.test(part))
    .map((part) => /^\s*path=/i.test(part) ? " Path=/" :
      /^\s*samesite=none$/i.test(part) ? " SameSite=Lax" : part)
    .join(";");
}
async function authProxy(request, url) {
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(request.method))
    return new Response("Method not allowed", {status:405});
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin)
    return new Response("Origin not allowed", {status:403});
  if (MUTATING.has(request.method) && request.headers.get("sec-fetch-site") === "cross-site")
    return new Response("Cross-site request denied", {status:403});

  const headers = new Headers();
  for (const key of ["accept", "accept-language", "content-type", "cookie", "user-agent",
                     "authorization", "x-neon-auth-session-verifier"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (origin) headers.set("origin", origin);
  const target = new URL(AUTH_UPSTREAM + url.pathname.slice("/auth".length) + url.search);
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "manual"
  });
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("set-cookie");
  const cookies = response.headers.getSetCookie?.() ||
    (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")] : []);
  for (const cookie of cookies) responseHeaders.append("set-cookie", stageCookie(cookie));
  responseHeaders.set("cache-control", "no-store");
  // Only rewrite auth-server self-redirects. Redirects to application URLs are preserved.
  const location = responseHeaders.get("location");
  if (location) {
    const redirected = new URL(location, AUTH_UPSTREAM + "/");
    if (redirected.origin === new URL(AUTH_UPSTREAM).origin &&
        redirected.pathname.startsWith(new URL(AUTH_UPSTREAM).pathname)) {
      responseHeaders.set("location", url.origin + "/auth" +
        redirected.pathname.slice(new URL(AUTH_UPSTREAM).pathname.length) +
        redirected.search + redirected.hash);
    }
  }
  return new Response(response.body, {status:response.status, headers:responseHeaders});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/auth" || url.pathname.startsWith("/auth/"))
      return authProxy(request, url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin)
      return new Response("Origin not allowed", {status:403});
    const headers = new Headers(request.headers);
    // API authenticates via a signed JWT, not a website session cookie.
    headers.delete("cookie");
    headers.delete("origin");
    headers.delete("referer");
    headers.delete("host");
    const upstream = new URL(url.pathname + url.search, API_UPSTREAM);
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual"
    });
    const resultHeaders = new Headers(response.headers);
    resultHeaders.delete("set-cookie");
    resultHeaders.set("cache-control", "no-store");
    return new Response(response.body, {status:response.status, headers:resultHeaders});
  }
};
