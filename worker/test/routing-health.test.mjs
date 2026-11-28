import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {neonApi} from '../src/neon-api.js';
test('only a verified staging administrator can probe the actual fixed cycling provider contract',async t=>{
 const issuer='https://routing-probe.fixture.test',base='https://kota-connect-api-dev.siboniisozulu.workers.dev';
 const {privateKey,publicKey}=await generateKeyPair('EdDSA'),jwk={...await exportJWK(publicKey),kid:'routing-health',alg:'EdDSA'};
 const jwt=await new SignJWT({}).setProtectedHeader({alg:'EdDSA',kid:jwk.kid}).setSubject('fixture-admin').setIssuer(issuer).setIssuedAt().setExpirationTime('5m').sign(privateKey);
 let admin=true,verified=true,calls=0,providerStatus=200;
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  if(String(url)===issuer+'/.well-known/jwks.json')return Response.json({keys:[jwk]});
  calls++;assert.equal(String(url),'https://api.heigit.org/openrouteservice/v2/directions/cycling-regular/json');assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,'fixture-private-key');
  assert.deepEqual(JSON.parse(init.body),{coordinates:[[29.93,-27.75],[29.94,-27.76]]});
  return Response.json(providerStatus===200?{routes:[{summary:{distance:1234.2}}]}:{error:'private-upstream-detail'},{status:providerStatus});
 });
 const db={query:async(sql)=>{assert(sql.startsWith('SELECT'));if(sql.includes('neon_auth.'))return {rows:[{email_verified:verified,banned:false}]};if(sql.includes('kc_admins'))return {rows:admin?[{}]:[],rowCount:admin?1:0};throw Error('Unexpected query');}};
 const env={NEON_ONLY_MODE:'true',NEON_AUTH_URL:issuer,KOTA_ROUTING_API_KEY:'fixture-private-key'};
 const run=(config=env,auth='Bearer '+jwt,origin=base)=>neonApi(new Request(origin+'/api/admin/routing-health',{headers:{authorization:auth}}),config,(_,fn)=>fn(db));
 const ok=await run();assert.equal(ok.status,200);assert.deepEqual(await ok.json(),{ok:true,provider:'heigit-cycling-regular',distance_m:1235});
 admin=false;assert.equal((await run()).status,403);admin=true;verified=false;assert.equal((await run()).status,403);verified=true;
 assert.equal((await run(env,'')).status,401);assert.equal((await run(env,'Guest '+'ab'.repeat(32))).status,401);assert.equal(calls,1);
 assert.equal((await run({...env,NEON_ONLY_MODE:'false'})).status,503);assert.equal((await run(env,'Bearer '+jwt,'https://production.example')).status,503);assert.equal(calls,1);
 providerStatus=429;const fail=await run();assert.equal(fail.status,503);assert.deepEqual(await fail.json(),{ok:false,error:'Cycling route verification unavailable'});
});
