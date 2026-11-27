import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { neonApi } from '../src/neon-api.js';
test('owner lifecycle matches inspected Neon transition guard, without side effects for rejected steps',async t=>{
 const {privateKey,publicKey}=await generateKeyPair('EdDSA');const jwk={...await exportJWK(publicKey),kid:'status-fixture',alg:'EdDSA'};
 const issuer='https://kota-status-fixture.example.test';const token=await new SignJWT({}).setProtectedHeader({alg:'EdDSA',kid:jwk.kid}).setSubject('fixture-owner').setIssuer(issuer).setIssuedAt().setExpirationTime('2m').sign(privateKey);
 t.mock.method(globalThis,'fetch',async url=>{assert.equal(String(url),issuer+'/.well-known/jwks.json');return Response.json({keys:[jwk]});});
 for(const [before,after,expected] of [['pending','delayed',200],['delayed','accepted',200],['delayed','rejected',200],['delayed','preparing',409],['delayed','ready_for_collection',409],['delayed','out_for_delivery',409],['preparing','out_for_delivery',409],['out_for_delivery','completed',409],['ready_for_collection','completed',409]]){
  const writes=[];const calls=[];
  const db={query:async(sql,args=[])=>{calls.push(sql);if(sql.includes('FROM neon_auth."user"'))return {rows:[{email_verified:true,banned:false,ban_active:false}]};if(sql.includes('FROM kc_admins WHERE'))return {rows:[],rowCount:0};if(sql.startsWith('SELECT 1 FROM kc_shops'))return {rows:[{}],rowCount:1};if(sql.startsWith('SELECT o.id,o.status'))return {rows:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:before,fulfillment_type:after==='ready_for_collection'?'pickup':'delivery',customer_subject:'fixture-customer'}]};if(sql.startsWith('UPDATE')||sql.startsWith('INSERT'))writes.push({sql,args});return {rows:[],rowCount:1};}};
  const response=await neonApi(new Request('https://kota-connect-api-dev.siboniisozulu.workers.dev/api/owner/orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/status',{method:'PATCH',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({status:after,note:'TEST transition'})}),{NEON_AUTH_URL:issuer},(_,fn)=>fn(db));
  assert.equal(response.status,expected,`${before} -> ${after}`);
  if(expected===409){assert.equal(writes.length,0);assert.equal(calls.at(-1),'ROLLBACK');}
  else {assert.equal(writes.filter(x=>x.sql.startsWith('UPDATE kc_orders')).length,1);assert.equal(calls.at(-1),'COMMIT');}
 }
});

test('owner can safely retry committed delivery readiness after a lost dispatch acknowledgement',async t=>{
 const {privateKey,publicKey}=await generateKeyPair('EdDSA');
 const jwk={...await exportJWK(publicKey),kid:'ready-retry',alg:'EdDSA'},issuer='https://ready-retry.example.test';
 const token=await new SignJWT({}).setProtectedHeader({alg:'EdDSA',kid:jwk.kid}).setSubject('fixture-owner').setIssuer(issuer).setIssuedAt().setExpirationTime('2m').sign(privateKey);
 t.mock.method(globalThis,'fetch',async url=>{assert.equal(String(url),issuer+'/.well-known/jwks.json');return Response.json({keys:[jwk]});});
 const writes=[],calls=[];
 const db={query:async(sql)=>{calls.push(sql);
  if(sql.includes('FROM neon_auth."user"'))return {rows:[{email_verified:true,banned:false,ban_active:false}]};
  if(sql.includes('FROM kc_admins WHERE'))return {rows:[],rowCount:0};
  if(sql.startsWith('SELECT 1 FROM kc_shops'))return {rows:[{}],rowCount:1};
  if(sql.startsWith('SELECT o.id,o.status'))return {rows:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'ready_for_collection',fulfillment_type:'delivery',customer_subject:'fixture-customer'}]};
  if(sql.startsWith('UPDATE')||sql.startsWith('INSERT'))writes.push(sql);
  return {rows:[],rowCount:1};}};
 const response=await neonApi(new Request('https://kota-connect-api-dev.siboniisozulu.workers.dev/api/owner/orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/status',{method:'PATCH',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({status:'ready_for_collection',approveCashOnDelivery:true})}),{NEON_AUTH_URL:issuer,KOTA_STAGING_ROUTING_APPROVED:'true'},(_,fn)=>fn(db));
 assert.equal(response.status,200);const result=await response.json();assert.equal(result.ok,true);
 assert.equal(result.dispatchAccepted,false,'unconfigured delivery still fails closed instead of claiming assignment');
 assert.equal(writes.length,0,'retry cannot duplicate status history, notifications or COD approval');
 assert.equal(calls.at(-1),'COMMIT');
});
