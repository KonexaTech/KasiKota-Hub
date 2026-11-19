const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const app=fs.readFileSync("staging-preview/neon-app.js","utf8");
const first=app.indexOf("function isSignedJwt(value){");
const last=app.indexOf("\nasync function api(path,",first);
assert.ok(first>=0&&last>first);
const helper=app.slice(first,last);
function create({sessionResult,headerToken="",throws=false}){
 const auth={getSession:async(options)=>{if(throws)throw Error("session transport failure");options?.fetchOptions?.onSuccess?.({response:{headers:{get:k=>k==="set-auth-jwt"?headerToken:null}}});return sessionResult}};
 const window={};const context={auth,window};
 vm.runInNewContext('const AUTH_URL="https://site.pages.dev/auth";'+helper+';globalThis.apiJwt=apiJwt;',context);
 return context.apiJwt;
}
test("uses signed JWT exposed as data.session.token",async()=>{
 const request=create({sessionResult:{data:{user:{id:"u"},session:{token:"head.payload.signature"}}}});
 assert.equal(await request(),"head.payload.signature");
});
test("falls back to set-auth-jwt response header",async()=>{
 const request=create({sessionResult:{data:{user:{id:"u"},session:{token:"opaque"}}},headerToken:"head.payload.signature"});
 assert.equal(await request(),"head.payload.signature");
});
test("does not send an opaque session token to API",async()=>{
 const request=create({sessionResult:{data:{user:{id:"u"},session:{token:"opaque"}}}});
 await assert.rejects(request(),/did not include a signed JWT/);
});
test("requires an active session",async()=>{
 const request=create({sessionResult:{data:null}});
 await assert.rejects(request(),/No active Neon Auth session/);
});
test("surfaces auth and transport errors",async()=>{
 await assert.rejects(create({sessionResult:{error:{message:"expired"}}})(),/expired/);
 await assert.rejects(create({throws:true})(),/session transport failure/);
});
test("whole app parses and keeps admin/owner authorization on server",()=>{
 const script=app.replace(/^import\s+\{[^}]+\}\s+from\s+"[^"]+";\s*/gm,"");
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.match(app,/session\.data\.session\.token/);
 assert.match(app,/me\.admin===false/);
 assert.match(app,/me\.admin===true/);
});
