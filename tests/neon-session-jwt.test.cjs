const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const app=fs.readFileSync("staging-preview/neon-app.js","utf8");
const first=app.indexOf("function isSignedJwt(value){");
const last=app.indexOf("\nasync function api(path,",first);
assert.ok(first>=0&&last>first,"JWT helper must be present");
const helper=app.slice(first,last);
function create(result,throws=false){
  const calls=[];
  const auth={token:async()=>{calls.push("token");if(throws)throw new Error("network");return result}};
  const context={auth};
  vm.runInNewContext('const AUTH_URL="https://site.pages.dev/auth";'+helper+';globalThis.apiJwt=apiJwt;',context);
  return {request:context.apiJwt,calls};
}
test("Neon Auth SDK token() supplies the signed JWT",async()=>{
  const {request,calls}=create({data:{token:"head.payload.signature"},error:null});
  assert.equal(await request(),"head.payload.signature");
  assert.deepEqual(calls,["token"]);
});
test("Neon Auth SDK errors are reported without exposing tokens",async()=>{
  await assert.rejects(create({data:null,error:{message:"Session expired"}}).request(),/Session expired/);
});
test("missing signed JWT is rejected",async()=>{
  await assert.rejects(create({data:{token:"opaque-session"},error:null}).request(),/did not return a signed API access token/);
});
test("SDK network failures have a distinct message",async()=>{
  await assert.rejects(create(null,true).request(),/could not issue an API access token/);
});
test("entire app script parses and still verifies owner/admin via server",()=>{
  const script=app.replace(/^import\s+\{[^}]+\}\s+from\s+"[^"]+";\s*/gm,"");
  assert.doesNotThrow(()=>new vm.Script(script));
  assert.match(app,/await auth\.token\(\)/);
  assert.doesNotMatch(app,/fetch\(tokenUrl/);
  assert.match(app,/me\.admin===false/);
  assert.match(app,/me\.admin===true/);
});
