const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const app=fs.readFileSync("staging-preview/neon-app.js","utf8");
const first=app.indexOf("function isSignedJwt(value){");
const last=app.indexOf("\nasync function api(path,",first);
assert.ok(first>=0&&last>first,"JWT helper must be present");
const helper=app.slice(first,last);
function create(response){
  const calls=[];
  const context={
    fetch:async(url,options={})=>{
      calls.push({url,options});
      if(response instanceof Error)throw response;
      return response;
    },
  };
  vm.runInNewContext('const AUTH_URL="https://site.pages.dev/auth";'+helper+';globalThis.apiJwt=apiJwt;',context);
  return {request:context.apiJwt,calls};
}
const http=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
test("direct token endpoint returns a signed JWT and sends the first-party cookie",async()=>{
  const {request,calls}=create(http(200,{token:"head.payload.signature"}));
  assert.equal(await request(),"head.payload.signature");
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,"https://site.pages.dev/auth/token");
  assert.equal(calls[0].options.credentials,"include");
  assert.equal(calls[0].options.cache,"no-store");
});
test("nested token responses are recognized",async()=>{
  assert.equal(await create(http(200,{data:{token:"head.payload.signature"}})).request(),"head.payload.signature");
});
test("HTTP 401 is surfaced without leaking session secrets",async()=>{
  await assert.rejects(create(http(401,{error:{message:"Unauthorized"}})).request(),/HTTP 401.*Unauthorized/);
});
test("an opaque session ID is never accepted as a JWT",async()=>{
  await assert.rejects(create(http(200,{token:"opaque-session-id"})).request(),/HTTP 200 without a signed JWT/);
});
test("a successful response without a JWT is diagnosed",async()=>{
  await assert.rejects(create(http(200,{data:{session:{token:"opaque-session-id"}}})).request(),/HTTP 200 without a signed JWT/);
});
test("network failures have a distinct message",async()=>{
  await assert.rejects(create(new Error("network")).request(),/could not be reached/);
});
test("whole app parses and keeps role authorization on the server",()=>{
  const script=app.replace(/^import\s+\{[^}]+\}\s+from\s+"[^"]+";\s*/gm,"");
  assert.doesNotThrow(()=>new vm.Script(script));
  assert.match(app,/fetch\(tokenUrl,/);
  assert.match(app,/credentials:"include"/);
  assert.match(app,/me\.admin===false/);
  assert.match(app,/me\.admin===true/);
  assert.doesNotMatch(app,/submitPendingShopApplication\(\)/);
});
