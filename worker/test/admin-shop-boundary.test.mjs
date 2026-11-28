import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {neonApi} from '../src/neon-api.js';
test('shop management routes require signed verified non-banned administrator identity before audit or approval access',async t=>{
 const issuer='https://admin-boundary.fixture.test';
 const keys=await generateKeyPair('EdDSA'),jwk={...await exportJWK(keys.publicKey),kid:'boundary'};
 const token=await new SignJWT({}).setProtectedHeader({alg:'EdDSA',kid:jwk.kid}).setIssuer(issuer).setSubject('fixture-admin').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
 t.mock.method(globalThis,'fetch',async()=>Response.json({keys:[jwk]}));
 let admin=true,verified=true,banned=false,checks=0;
 const db={query:async sql=>{
  assert(sql.startsWith('SELECT'),'Read-only capability must never write');
  if(sql.includes('neon_auth.'))return {rows:[{email_verified:verified,banned,ban_active:true}]};
  if(sql.startsWith('SELECT 1 FROM kc_admins'))return {rows:admin?[{}]:[],rowCount:admin?1:0};
  if(sql.startsWith('SELECT id FROM kc_shop_admin_events')){checks++;return {rows:[]};}
  assert.fail('Unexpected query');
 }};
 const run=authorization=>neonApi(new Request('https://staging.fixture/api/admin/shop-management',{headers:authorization?{authorization}:{}}),{NEON_AUTH_URL:issuer,KOTA_SHOP_ADMIN_ENABLED:'true'},(_,fn)=>fn(db));
 assert.equal((await run('Bearer '+token)).status,200);assert.equal(checks,1);
 admin=false;assert.equal((await run('Bearer '+token)).status,403);admin=true;
 verified=false;assert.equal((await run('Bearer '+token)).status,403);verified=true;banned=true;assert.equal((await run('Bearer '+token)).status,403);
 assert.equal((await run()).status,401);assert.equal((await run('Guest '+'ab'.repeat(32))).status,401);assert.equal(checks,1);
});
