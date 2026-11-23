import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const files=["staging-preview/neon-customer.html","staging-preview/neon-app.js"];
test("customer page contains exactly one HTML document and welcome flow",()=>{
  const s=fs.readFileSync(files[0],"utf8");
  assert.equal((s.match(/<!doctype html>/gi)||[]).length,1);
  assert.ok(s.trimStart().startsWith("<!doctype html>"));
  assert.equal((s.match(/<html\b/gi)||[]).length,1);
  assert.equal((s.match(/<\/html>/gi)||[]).length,1);
  for(const selector of ['id="welcome"','id="proceed"','id="area"','id="shopSearch"','id="confirmStep"','id="trackStep"'])assert.ok(s.includes(selector));
});
test("staging owner/admin script has no accidentally concatenated branch revisions",()=>{
 const s=fs.readFileSync(files[1],"utf8");
 assert.doesNotMatch(s,/^(feature|fix|diagnostics)\/[\w-]+$/gm);
 assert.match(s,/bind\("saveShopDetails"/);
 assert.match(s,/bind\("adminOverview"/);
 assert.match(s,/function isSignedJwt/);
});

test('owner and admin retain one approved dashboard document without duplicate controls',()=>{
 for(const path of ['staging-preview/neon-owner.html','staging-preview/neon-admin.html']){
  const text=fs.readFileSync(path,'utf8');
  assert.equal((text.match(/<!doctype html>/gi)||[]).length,1,path);
  assert(text.trimStart().startsWith('<!doctype html>'),path);
  const ids=[...text.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length,'Duplicate dashboard control IDs: '+path);
 }
});
