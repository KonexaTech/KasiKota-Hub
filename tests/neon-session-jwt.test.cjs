const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const app=fs.readFileSync("staging-preview/neon-app.js","utf8");
const first=app.indexOf("function isSignedJwt(value){");
const last=app.indexOf("\nasync function api(path,",first);
assert.ok(first>=0&&last>first);
const helper=app.slice(first,last);
function create({payload,status=200,throws=false,invalidJson=false}){
 const calls=[];
 const fetch=async(url,options={})=>{
  calls.push({url,options});
  if(throws)throw Error("token endpoint transport failure");
  return {ok:status>=200&&status<300,status,json:async()=>{if(invalidJson)throw Error("invalid JSON");return payload;}};
 };
 const context={fetch};
 vm.runInNewContext('const AUTH_URL="https://site.pages.dev/auth";'+helper+';globalThis.apiJwt=apiJwt;',context);
 return {request:context.apiJwt,calls};
}
test("retrieves a signed JWT from the same-origin Neon Auth token endpoint",async()=>{
 const {request,calls}=create({payload:{token:"head.payload.signature"}});
 assert.equal(await request(),"head.payload.signature");
 assert.equal(calls[0].url,"https://site.pages.dev/auth/token");
 assert.equal(calls[0].options.method,"GET");
 assert.equal(calls[0].options.credentials,"include");
 assert.equal(calls[0].options.cache,"no-store");
});
test("accepts the wrapped Neon token response shape",async()=>{
 const {request}=create({payload:{data:{token:"head.payload.signature"}}});
 assert.equal(await request(),"head.payload.signature");
});
test("rejects opaque session cookies instead of sending them as bearer JWTs",async()=>{
 const {request}=create({payload:{token:"opaque-session-cookie"}});
 await assert.rejects(request(),/without a signed JWT/);
});
test("surfaces HTTP errors without exposing token contents",async()=>{
 const {request}=create({payload:{message:"Unauthorized"},status:401});
 await assert.rejects(request(),/HTTP 401/);
});
test("surfaces invalid JSON and transport errors safely",async()=>{
 await assert.rejects(create({payload:null,invalidJson:true}).request(),/invalid response/);
 await assert.rejects(create({payload:null,throws:true}).request(),/token endpoint transport failure/);
});
test("whole app parses and keeps administrator and owner authorization server-enforced",()=>{
 const script=app.replace(/^import\s+\{[^}]+\}\s+from\s+["\x27][^"\x27]+["\x27];\s*/gm,"");
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.ok(app.includes("fetch(tokenUrl,"));
 assert.ok(app.includes('credentials:"include"'));
 assert.ok(app.includes("me.admin===false"));
 assert.ok(app.includes("me.admin===true"));
 assert.ok(!app.includes("session.data.session.token"));
});

test("owner sign-in form invokes its asynchronous submit handler",()=>{
 const start=app.indexOf('$("signin").addEventListener("submit"');
 const end=app.indexOf('\nbind("sendVerification"',start);
 assert.ok(start>=0&&end>start,"sign-in handler must exist");
 const handler=app.slice(start,end);
 assert.match(handler,/safe\(async\(\)=>\{/);
 assert.match(handler,/if\(signInPending\)return/);
 assert.match(handler,/submit\.textContent="Signing in…"/);
 assert.match(handler,/\}\)\(\)\.finally\(\(\)=>\{/,"Sign-in must restore its busy indicator after success or failure");
});
