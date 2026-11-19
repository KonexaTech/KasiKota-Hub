const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const src=fs.readFileSync("staging-preview/neon-app.js","utf8");
assert.match(src,/createAuthClient\(AUTH_URL\)/,"Use the supported Neon vanilla client");
const start=src.indexOf("function isSignedJwt(value){");
const end=src.indexOf("\nasync function api(path,",start);
assert.ok(start>=0 && end>start,"Signed JWT helper is present");
const helper=src.slice(start,end);
function client(auth){
  const context={auth};
  vm.runInNewContext(helper+";globalThis.apiJwt=apiJwt;globalThis.isSignedJwt=isSignedJwt;",context);
  return context;
}
const user={id:"owner-test"};
test("use JWT from official token endpoint", async()=>{
  const c=client({token:async()=>({data:{token:"head.payload.sig"}})});
  assert.equal(await c.apiJwt(),"head.payload.sig");
});
test("recover JWT from documented getSession response header",async()=>{
  const c=client({
    token:async()=>({data:{token:null}}),
    getSession:async options=>{
      options.fetchOptions.onSuccess({response:{headers:{get:n=>n==="set-auth-jwt"?"head.payload.sig":null}}});
      return {data:{user,session:{token:"opaque-session-id"}}};
    }
  });
  assert.equal(await c.apiJwt(),"head.payload.sig");
});
test("never forward Better Auth session ID as JWT",async()=>{
  const c=client({token:async()=>({data:{token:"opaque-session-id"}}),getSession:async()=>({data:{user,session:{token:"opaque-session-id"}}})});
  await assert.rejects(c.apiJwt(),/Neon JWT token could not be retrieved/);
});
test("reject unauthenticated user",async()=>{
  const c=client({token:async()=>({data:null}),getSession:async()=>({data:{user:null}})});
  await assert.rejects(c.apiJwt(),/Sign in to continue/);
});
test("use signed JWT header when token endpoint errors",async()=>{
  const c=client({
    token:async()=>{throw Error("network")},
    getSession:async options=>{
      options.fetchOptions.onSuccess({response:{headers:{get:()=> "header.payload.signature"}}});
      return {data:{user}};
    }
  });
  assert.equal(await c.apiJwt(),"header.payload.signature");
});
test("staging source parses as valid module body",()=>{
  const noImport=src.replace(/^import \{ createAuthClient \} from "[^"]+";\s*/,"");
  assert.doesNotThrow(()=>new vm.Script(noImport));
});
