// Isolated staging-only proxy: do not expose database credentials or production APIs.
const UPSTREAM = "https://kota-connect-api-dev.siboniisozulu.workers.dev";
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) return new Response("Origin not allowed", {status:403});
    const headers = new Headers(request.headers);
    headers.delete("origin");
    headers.delete("referer");
    headers.delete("host");
    const upstream = new URL(url.pathname + url.search, UPSTREAM);
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
