import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const env = { NEON_ONLY_MODE: "true", NEON_AUTH_BASE_URL: "https://auth.example.test" };
const request = (path, method = "GET", origin) => new Request("https://worker.example.test" + path, { method, ...(origin ? { headers: { Origin: origin } } : {}) });

test("password recovery pages are routed before the API-only guard", async () => {
  for (const path of ["/password-reset-request", "/password-reset"]) {
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /text\/html/);
  }
});

test("password reset submission reaches validation without external calls", async () => {
  const response = await worker.fetch(new Request("https://worker.example.test/password-reset/request", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "invalid" })
  }), env);
  assert.equal(response.status, 400);
});

test("origin restriction and method restriction remain enforced", async () => {
  assert.equal((await worker.fetch(request("/password-reset-request", "GET", "https://evil.example"), env)).status, 403);
  assert.equal((await worker.fetch(request("/password-reset-request", "DELETE"), env)).status, 405);
});

test("recovery pages require the staging Neon-only mode, and unknown paths remain unavailable", async () => {
  const blocked = await worker.fetch(request("/password-reset-request"), { NEON_ONLY_MODE:"false" });
  assert.equal(blocked.status,503);

  assert.equal((await worker.fetch(request("/unrelated"), env)).status, 404);
});

test("staging entry is bundled locally and does not fetch unpinned remote GitHub HTML", async () => {
  const oldFetch=globalThis.fetch;
  let networkCalls=0;
  globalThis.fetch=async()=>{networkCalls++;throw Error('Unexpected remote staging fetch');};
  try {
    const response=await worker.fetch(request('/staging'),env);
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type')||'',/text\/html/);
    assert.match(response.headers.get('content-security-policy')||'',/default-src 'none'/);
    const html=await response.text();
    assert.match(html,/kota-connect-neon-staging\.pages\.dev\/neon-customer\.html/);
    assert.doesNotMatch(html,/raw\.githubusercontent\.com|<script/i);
    assert.equal(networkCalls,0);
  } finally { globalThis.fetch=oldFetch; }
});
