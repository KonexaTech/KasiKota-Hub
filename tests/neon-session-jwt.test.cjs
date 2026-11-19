const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const app=fs.readFileSync("staging-preview/neon-app.js","utf8");
const first=app.indexOf("function isSignedJwt(value){");
const last=app.indexOf("\nasync function api(path,",first);
assert.ok(first>=0&&last>first,"JWT helper must be present");
const helper=app.slice(first,last);
function create({tokenResult,sessionResult,headerToken="",tokenThrows=false,sessionThrows=false}){
  const calls=[];
  const auth={
    token:async()=>{calls.push("token");if(tokenThrows)throw Error("token transport failure");return tokenResult},
    getSession:async(options)=>{calls.push("getSession");if(sessionThrows)throw Error("session transport failure");options?.fetchOptions?.onSuccess?.({response:{headers:{get:(key)=>key==="set-auth-jwt"?headerToken:null}}});return sessionResult}
  };
  const context={auth};
  vm.runInNewContext('const AUTH_URL="https://site.pages.dev/auth";'+helper+';globalThis.apiJwt=apiJwt;',context);
  return {request:context.apiJwt,calls};
}
test("Managed Auth token endpoint returns signed JWT",async()=>{
  const x=create({tokenResult:{data:{token:"head.payload.signature"}},sessionResult:{data:{user:{id:"u"}}}});
  assert.equal(await x.request(),"head.payload.signature");
  assert.deepEqual(x.calls,["token"]);
});
test("falls back to signed set-auth-jwt header when token endpoint has no JWT",async()=>{
  const x=create({tokenResult:{data:{}},sessionResult:{data:{user:{id:"u"}}},headerToken:"head.payload.signature"});
  assert.equal(await x.request(),"head.payload.signature");
  assert.deepEqual(x.calls,["token","getSession"]);
});
test("does not use opaque session identifiers as API JWTs",async()=>{
  const x=create({tokenResult:{data:{token:"opaque-session"}},sessionResult:{data:{user:{id:"u",session:{token:"opaque-session"}}}}});
  await assert.rejects(x.request(),/Session JWT header: JWT response header missing/);
});
test("reports token endpoint errors and attempts session header fallback",async()=>{
  const x=create({tokenResult:{error:{message:"JWT endpoint disabled"}},sessionResult:{data:{user:{id:"u"}}}});
  await assert.rejects(x.request(),/JWT endpoint disabled.*JWT response header missing/);
});
test("requires an active session when header fallback has no JWT",async()=>{
  const x=create({tokenResult:{data:{}},sessionResult:{data:null}});
  await assert.rejects(x.request(),/no active signed-in session/);
});
test("transport errors are distinguishable",async()=>{
  const x=create({tokenThrows:true,sessionThrows:true});
  await assert.rejects(x.request(),/token transport failure.*session transport failure/);
});
test("whole app parses and admin/owner access remains server-authorized",()=>{
  const script=app.replace(/^import\s+\{[^}]+\}\s+from\s+"[^"]+";\s*/gm,"");
  assert.doesNotThrow(()=>new vm.Script(script));
  assert.match(app,/await auth\.token\(\)/);
  assert.match(app,/set-auth-jwt/);
  assert.match(app,/me\.admin===false/);
  assert.match(app,/me\.admin===true/);
});
