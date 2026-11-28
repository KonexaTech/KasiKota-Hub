import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {neonApi} from '../src/neon-api.js';
const origin='https://kota-connect-api-dev.siboniisozulu.workers.dev';
const target='https://konexa-delivery-private-staging.pages.dev';
const ready={ok:true,service:'konexa-delivery',sourceCommit:'a'.repeat(40),payments_enabled:false,driver_schema_ready:true,auth_schema_ready:true,status_schema_ready:true};
test('staging health uses only the existing pinned service identity, never user headers or response secrets',async t=>{
 const {privateKey,publicKey}=await generateKeyPair('EdDSA'),issuer='https://delivery-health.example.test';
 const jwk={...await exportJWK(publicKey),kid:'delivery-health',alg:'EdDSA'};
 const token=await new SignJWT({}).setProtectedHeader({alg:'EdDSA',kid:jwk.kid}).setSubject('fixture-admin').setIssuer(issuer).setIssuedAt().setExpirationTime('5m').sign(privateKey);
 let admin=true,account=true,calls=0,upstream=()=>Response.json({...ready,secret:'fixture-never-return',users:['private']});
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  if(String(url)===issuer+'/.well-known/jwks.json')return Response.json({keys:[jwk]});
  calls++;assert.equal(String(url),target+'/v1/health');assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert(init.signal);
  assert.deepEqual(Object.keys(init.headers).sort(),['accept','cf-access-client-id','cf-access-client-secret']);
  assert.equal(init.headers['cf-access-client-id'],'fixture-client');assert.equal(init.headers['cf-access-client-secret'],'fixture-secret');return upstream();
 });
 const env={NEON_ONLY_MODE:'true',NEON_AUTH_URL:issuer,DELIVERY_SERVICE_URL:target,DELIVERY_CF_ACCESS_CLIENT_ID:'fixture-client',DELIVERY_CF_ACCESS_CLIENT_SECRET:'fixture-secret'};
 const db={query:async(sql)=>{assert(sql.startsWith('SELECT'),'Probe must not write');if(sql.includes('neon_auth.'))return {rows:account?[{email_verified:true,banned:false}]:[]};if(sql.includes('kc_admins'))return {rows:admin?[{}]:[],rowCount:admin?1:0};throw Error('Unexpected query');}};
 const run=(e=env,authorization='Bearer '+token,url=origin)=>neonApi(new Request(url+'/api/admin/delivery-health',{headers:{authorization,cookie:'private-session'}}),e,(_,fn)=>fn(db));
 const r=await run();assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,delivery_source_commit:ready.sourceCommit,payments_enabled:false});assert.equal(calls,1);
 admin=false;assert.equal((await run()).status,403);admin=true;account=false;assert.equal((await run()).status,403);account=true;
 assert.equal((await run(env,'')).status,401);assert.equal((await run(env,'Guest '+'ab'.repeat(32))).status,401);assert.equal(calls,1,'unauthorized callers never reach Delivery');
 for(const patch of [{NEON_ONLY_MODE:'false'},{DELIVERY_SERVICE_URL:'https://evil.example'},{DELIVERY_SERVICE_URL:target+'/other'},{DELIVERY_CF_ACCESS_CLIENT_SECRET:''}])assert.equal((await run({...env,...patch})).status,503);
 assert.equal((await run(env,'Bearer '+token,'https://production.example')).status,503);assert.equal(calls,1);
 for(const body of [{...ready,payments_enabled:true},{...ready,status_schema_ready:false},{...ready,sourceCommit:'invalid'},null]){upstream=()=>Response.json(body);assert.equal((await run()).status,503);}
 upstream=()=>Response.json({stage:'database_probe',secret:'NEVER_RETURN'},{status:503});const diagnostic=await run();assert.deepEqual(await diagnostic.json(),{ok:false,error:'Delivery health unavailable',diagnostic:'upstream_http_503_database_probe'});
 upstream=()=>new Response(null,{status:302,headers:{location:'https://evil.example'}});assert.equal((await run()).status,503);
 upstream=()=>{throw Error('private-token-must-not-leak')};const failed=await run();assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{ok:false,error:'Delivery health unavailable',diagnostic:'transport_or_invalid_response'});
});
