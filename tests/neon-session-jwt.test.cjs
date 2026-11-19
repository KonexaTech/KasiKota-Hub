const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("staging-preview/neon-app.js", "utf8");
const start = source.indexOf("function isSignedJwt(token){");
const end = source.indexOf("\nasync function api(path,", start);
assert.ok(start >= 0 && end > start, "Staging auth helper must exist");
assert.match(source, /createAuthClient\(AUTH_URL,\{fetchOptions:\{credentials:"include"\}\}\)/,
  "Cross-origin Neon session cookies must be included");

const authCode = source.slice(start, end);
async function jwtFor(sessionResponse, tokenResponse = {data: {token: null}}) {
  const context = {
    auth: {
      getSession: async () => sessionResponse,
      token: async () => tokenResponse,
    },
  };
  vm.runInNewContext(authCode + "; globalThis.testApiJwt = apiJwt;", context);
  return context.testApiJwt();
}
const user = {email: "owner@example.test"};
test("prefers the Neon access_token JWT", async () => {
  assert.equal(await jwtFor({data: {user, session: {access_token: "signed.jwt.value", token: "opaque-session"}}}), "signed.jwt.value");
});
test("uses the documented session.token JWT when signed", async () => {
  assert.equal(await jwtFor({data: {user, session: {token: "header.payload.signature"}}}), "header.payload.signature");
});
test("falls back to the Better Auth JWT endpoint, never the opaque ID", async () => {
  assert.equal(await jwtFor({data: {user, session: {token: "opaque-session"}}}, {data: {token: "fallback.jwt.signature"}}), "fallback.jwt.signature");
});
test("rejects an opaque session token", async () => {
  await assert.rejects(jwtFor({data: {user, session: {token: "opaque-session"}}}), /did not return a signed API token/);
});
test("rejects unauthenticated access", async () => {
  await assert.rejects(jwtFor({data: null}), /Sign in to continue/);
});
