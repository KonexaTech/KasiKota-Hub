// Real SQL persistence against embedded PostgreSQL locally and PostgreSQL17 in CI.
// JWT verification uses a disposable signed fixture/JWKS: NOT live Neon Auth acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { neonApi } from '../src/neon-api.js';
import { postgresFixture } from './postgres-fixture.mjs';
test('production order handler persists registration, approval, retries, delayed lifecycle, role isolation and notifications in PostgreSQL', {timeout:60000}, async t=>{
 const f=await postgresFixture(),{db}=f;const suffix=randomUUID(),owner='fixture-owner-'+suffix,admin='fixture-admin-'+suffix,other='fixture-other-'+suffix;
 const issuer='https://kota-postgres-'+suffix+'.example.test';
 const {privateKey,publicKey}=await generateKeyPair('EdDSA');const jwk={...await exportJWK(publicKey),kid:suffix,alg:'EdDSA'};
 t.mock.method(globalThis,'fetch',async url=>{assert.equal(String(url),issuer+'/.well-known/jwks.json');return Response.json({keys:[jwk]});});
 const tokens={};for(const subject of [owner,admin,other])tokens[subject]=await new SignJWT({}).setProtectedHeader({alg:'EdDSA',kid:suffix}).setIssuer(issuer).setSubject(subject).setIssuedAt().setExpirationTime('5m').sign(privateKey);
 const guests={customer:'ab'.repeat(32),outsider:'cd'.repeat(32)};
 const call=async(path,principal,method='GET',body)=>neonApi(new Request('https://kota-connect-api-dev.siboniisozulu.workers.dev'+path,{method,headers:{...(principal?{authorization:guests[principal]?'Guest '+guests[principal]:'Bearer '+tokens[principal]}:{}),'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),{NEON_AUTH_URL:issuer},(_,fn)=>fn(db));
 const expect=async(path,principal,method,body,status)=>{const r=await call(path,principal,method,body);assert.equal(r.status,status,path);return r.json();};
 try{
  await db.exec('CREATE SCHEMA IF NOT EXISTS neon_auth; CREATE TABLE IF NOT EXISTS neon_auth."user"(id text PRIMARY KEY,"emailVerified" boolean,banned boolean,"banExpires" timestamptz)');
  for(const subject of [owner,admin,other])await db.query('INSERT INTO neon_auth."user"(id,"emailVerified",banned) VALUES($1,true,false)',[subject]);
  await db.query('INSERT INTO kc_admins(subject) VALUES($1)',[admin]);
  const application=await expect('/api/shop-applications',owner,'POST',{ownerName:'TEST Owner',shopName:'TEST SQL Fixture',phone:'0000000000',area:'TEST Area',address:'TEST Location'},201);
  const pending=(await db.query('SELECT status FROM kc_shop_applications WHERE id=$1',[application.application.id])).rows[0];assert.equal(pending.status,'pending');
  assert.equal((await db.query('SELECT count(*)::int n FROM kc_notifications WHERE recipient_subject=$1',[admin])).rows[0].n,1,'new-application notification must obey the actual CHECK constraint');
  await expect('/api/admin/shop-applications/'+application.application.id+'/review',owner,'PATCH',{status:'approved'},403);
  await expect('/api/admin/shop-applications/'+application.application.id+'/review',admin,'PATCH',{status:'approved'},200);
  const shop=(await db.query('SELECT id,approved FROM kc_shops WHERE owner_subject=$1',[owner])).rows[0];assert.equal(shop.approved,true);
  const menu=await expect('/api/owner/shops/'+shop.id+'/menu',owner,'POST',{name:'TEST Kota',priceCents:2500},201);
  const payload={requestId:randomUUID().toUpperCase(),shopId:shop.id.toUpperCase(),items:[{itemId:menu.item.id.toUpperCase(),quantity:2,priceCents:1}],customerName:'TEST SQL Customer',customerPhone:'0000000000',area:'TEST Area',fulfillmentType:'pickup',totalCents:1};
  const created=await expect('/api/orders','customer','POST',payload,201),id=created.order.id;assert.equal(created.order.total_cents,5000);
  const replay=await expect('/api/orders','customer','POST',payload,200);assert.equal(replay.order.id,id);assert.equal(replay.replayed,true);
  await expect('/api/orders','customer','POST',{...payload,items:[{itemId:menu.item.id,quantity:3}]},409);
  assert.equal((await db.query('SELECT count(*)::int n FROM kc_orders')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM kc_order_items')).rows[0].n,1);
  assert.equal((await db.query('SELECT test_order FROM kc_orders WHERE id=$1',[id])).rows[0].test_order,true);
  await expect('/api/orders/'+id,'outsider','GET',undefined,403);
  await expect('/api/owner/orders/'+id+'/status',admin,'PATCH',{status:'accepted'},403);
  for(const status of ['delayed','accepted','preparing','ready_for_collection','completed']){
   await expect('/api/owner/orders/'+id+'/status',owner,'PATCH',{status,note:'TEST SQL transition'},200);
   assert.equal((await expect('/api/orders/'+id,'customer','GET',undefined,200)).order.status,status);
   if(status==='delayed')for(const invalid of ['preparing','ready_for_collection'])await expect('/api/owner/orders/'+id+'/status',owner,'PATCH',{status:invalid},409);
  }
  await expect('/api/owner/orders/'+id+'/status',owner,'PATCH',{status:'accepted'},409);
  const events=(await expect('/api/orders/'+id+'/history','customer','GET',undefined,200)).events;
  assert.deepEqual(events.map(e=>e.new_status),['pending','delayed','accepted','preparing','ready_for_collection','completed']);
  const notes=(await expect('/api/notifications','customer','GET',undefined,200)).notifications;
  assert.equal(notes.filter(n=>n.order_id===id).length,5);
  await expect('/api/notifications/'+notes[0].id+'/read','outsider','PATCH',{},404);
  await expect('/api/notifications/'+notes[0].id+'/read','customer','PATCH',{},200);
  assert((await expect('/api/notifications','customer','GET',undefined,200)).notifications.find(n=>n.id===notes[0].id).read_at);
  const commission=await expect('/api/admin/commission',admin,'GET',undefined,200);assert.equal(commission.rateCents,50);assert.equal(commission.thresholdCents,2000);assert.equal(commission.eligibleCompletedOrders,0);assert.equal(commission.commissionPaused,true);
  assert.equal((await db.query('SELECT count(*)::int n FROM kc_commission_entries')).rows[0].n,0);
  t.diagnostic('Scope: '+f.mode+'; actual handler+SQL, signed fixture issuer, no hosted API or physical device claim.');
 }finally{
  await db.query('DELETE FROM neon_auth."user" WHERE id=ANY($1::text[])',[[owner,admin,other]]).catch(()=>{});await f.close();
 }
});
