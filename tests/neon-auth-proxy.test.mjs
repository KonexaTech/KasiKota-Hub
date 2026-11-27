import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const proxy = await import(pathToFileURL(path.resolve("staging-preview/_worker.js")));
const worker = proxy.default;
const site = "https://kota-connect-neon-staging.pages.dev";
const calls = [];
const oldFetch = globalThis.fetch;

globalThis.fetch = async (input, options = {}) => {
  calls.push({
    url: String(input),
    method: options.method,
    headers: new Headers(options.headers)
  });
  const headers = new Headers({ "content-type": "application/json" });
  headers.append(
    "set-cookie",
    "__Secure-neon-auth.session_token=TEST_COOKIE; Path=/; Domain=ep-lively-leaf-za5rtfhs.neonauth.c-2.eu-west-2.aws.neon.tech; Secure; HttpOnly; SameSite=None; Partitioned"
  );
  return new Response('{"ok":true}', { status: 200, headers });
};

const assets = {
  ASSETS: { fetch: async () => new Response("static asset", { status: 200 }) },
  QA_API: { fetch: (...args) => globalThis.fetch(...args) }
};

function getCookies(res) {
  return res.headers.getSetCookie?.() || [res.headers.get("set-cookie")].filter(Boolean);
}

test("auth JWT endpoint uses same-origin proxy and forwards only the Neon session cookie", async () => {
  calls.length = 0;
  const req = new Request(site + "/auth/token", {
    headers: {
      Cookie: [
        "__Secure-neon-auth.session_token=opaque",
        "CF_Authorization=outer-access",
        "CF_AppSession=outer-session",
        "CF_Binding=outer-binding",
        "CF_Session=outer-session-cookie",
        "CF_Access=outer-access-cookie"
      ].join("; ")
    }
  });

  const res = await worker.fetch(req, assets);
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://ep-lively-leaf-za5rtfhs.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth/token"
  );
  assert.equal(calls[0].headers.get("cookie"), "__Secure-neon-auth.session_token=opaque");
});

test("auth proxy rewrites cookies to staging origin without exposing their secret", async () => {
  const res = await worker.fetch(new Request(site + "/auth/get-session"), assets);
  const cookie = getCookies(res)[0];

  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(cookie, /Domain=/i);
  assert.doesNotMatch(cookie, /Partitioned/i);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("rejects cross-origin sign-in requests", async () => {
  calls.length = 0;
  const res = await worker.fetch(new Request(site + "/auth/sign-in/email", {
    method: "POST",
    headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
    body: "{}"
  }), assets);

  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test("rejects cross-site auth mutations even when the origin header matches", async () => {
  calls.length = 0;
  const res = await worker.fetch(new Request(site + "/auth/sign-in/email", {
    method: "POST",
    headers: {
      Origin: site,
      "Sec-Fetch-Site": "cross-site",
      "Content-Type": "application/json"
    },
    body: "{}"
  }), assets);

  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test("API routes keep signed bearer tokens but never forward browser or Cloudflare Access credentials", async () => {
  calls.length = 0;
  const req = new Request(site + "/api/me", {
    headers: {
      Cookie: "__Secure-neon-auth.session_token=opaque",
      Authorization: "Bearer signed.jwt.signature",
      "CF-Access-Jwt-Assertion": "outer-access",
      "CF-Access-Client-Secret": "private-fixture"
    }
  });

  await worker.fetch(req, assets);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.get("cookie"), null);
  assert.equal(calls[0].headers.get("cf-access-jwt-assertion"), null);
  assert.equal(calls[0].headers.get("cf-access-client-secret"), null);
  assert.equal(calls[0].headers.get("authorization"), "Bearer signed.jwt.signature");
  assert.equal(calls[0].url, "https://kota-connect-api-dev.siboniisozulu.workers.dev/api/me");
});

test("API routes reject cross-site mutations before contacting the private API", async () => {
  calls.length = 0;
  const res = await worker.fetch(new Request(site + "/api/orders", {
    method: "POST",
    headers: {
      Origin: site,
      "Sec-Fetch-Site": "cross-site",
      "Content-Type": "application/json",
      Authorization: "Bearer signed.jwt.signature"
    },
    body: "{}"
  }), assets);

  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test("non auth/API assets retain the existing Pages asset handler", async () => {
  const res = await worker.fetch(new Request(site + "/neon-owner.html"), assets);
  assert.equal(await res.text(), "static asset");
});

test("browser app uses same-origin Auth and server-verified role checking", () => {
  const app = fs.readFileSync("staging-preview/neon-app.js", "utf8");
  assert.match(app, /const AUTH_URL=new URL\("\/auth",location.origin\)\.href;/);
  assert.match(app, /fetch\(tokenUrl,/);
  assert.match(app, /credentials:"include"/);
  assert.match(app, /\/api\/me/);
  assert.match(app, /me\.admin===false/);
  assert.match(app, /me\.admin===true/);
  assert.match(app, /ownerAccess\?\.approved===true/);

  const registration = fs.readFileSync("staging-preview/kota-shop-registration.mjs", "utf8");
  assert.match(registration, /fetch\("\/api\/shop-applications"/);
  assert.match(registration, /emailOtp\.verifyEmail/);
  assert.match(registration, /await auth\.signOut\(\)/);
});

test("missing private API binding and alternate hostnames never trigger a public fallback", async () => {
  calls.length = 0;

  const missingBinding = await worker.fetch(
    new Request(site + "/api/me"),
    { ASSETS: assets.ASSETS }
  );
  assert.equal(missingBinding.status, 503);

  const alternateHost = await worker.fetch(
    new Request("https://alternate.example/api/me"),
    assets
  );
  assert.equal(alternateHost.status, 403);
  assert.equal(calls.length, 0);
});

test.after(() => {
  globalThis.fetch = oldFetch;
});
