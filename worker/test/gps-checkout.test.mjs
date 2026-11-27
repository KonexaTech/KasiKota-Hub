import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {deliveryFixture} from './delivery-fixture.mjs';
import {neonApi} from '../src/neon-api.js';
test('restricted-role GPS checkout persists trusted R15/R10 snapshots, preserves guest retries and rejects changed destinations',async t=>{
 const f=await deliveryFixture(),role=f.schema+'_checkout',menu=randomUUID();
 try{
  await f.db.exec(await readFile(new URL('../../docs/release/delivery-input-storage.PROPOSED.sql',import.meta.url),'utf8'));
  await f.db.exec('CREATE SCHEMA IF NOT EXISTS neon_auth; CREATE TABLE IF NOT EXISTS neon_auth."user"(id text,"emailVerified" boolean,banned boolean,"banExpires" timestamptz)');
  let grants=await readFile(new URL('../../docs/release/kota-staging-runtime-role.PROPOSED.sql',import.meta.url),'utf8');
  grants=grants.replaceAll('public.',f.schema+'.').replaceAll('SCHEMA public, neon_auth','SCHEMA '+f.schema+', neon_auth').replaceAll('kc_staging_worker',role);
  await f.db.exec(grants);
  await f.db.exec("ALTER TABLE kc_orders ADD COLUMN payment_method text NOT NULL DEFAULT 'cash_on_delivery'");
  await f.db.exec((await readFile(new URL('../../docs/release/pending-delivery-quotes.PROPOSED.sql',import.meta.url),'utf8')).replaceAll('public.',f.schema+'.').replaceAll('kc_staging_worker',role));
  await f.db.exec(`GRANT INSERT(payment_method) ON kc_orders TO ${role}; GRANT UPDATE(dropoff_lat,dropoff_lon,delivery_location_saved_at) ON kc_orders TO ${role}; GRANT INSERT ON kc_pending_delivery_quotes TO ${role};`);
  await f.db.exec((await readFile(new URL('../../docs/release/gps-runtime-grants.sql',import.meta.url),'utf8')).replaceAll('public.',f.schema+'.').replaceAll('kc_staging_worker',role));
  const shop=(await f.db.query('SELECT shop_id FROM kc_orders LIMIT 1')).rows[0].shop_id;
  await f.db.query('UPDATE kc_shops SET pickup_lat=-26,pickup_lon=28,pickup_location_saved_at=now() WHERE id=$1',[shop]);
  await f.db.query("INSERT INTO kc_menu_items(id,shop_id,name,price_cents,weight_grams) VALUES($1,$2,'TEST GPS',1000,500)",[menu,shop]);
  let routes=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
   assert.equal(String(url),'https://api.openrouteservice.org/v2/directions/cycling-regular/json');
   assert.deepEqual(Object.keys(JSON.parse(options.body)),['coordinates']);routes++;
   return Response.json({routes:[{summary:{distance:543.2}}]});
  });
  // Explicit fixture limits are not approved production business limits.
  const env={KOTA_STAGING_ROUTING_APPROVED:'true',KOTA_MAX_CYCLING_DISTANCE_M:'10000',KOTA_MAX_CYCLING_WEIGHT_G:'5000',KOTA_ROUTING_API_KEY:'FIXTURE ONLY'};
  const payload={requestId:randomUUID(),shopId:shop,items:[{itemId:menu,quantity:2,priceCents:1}],customerName:'TEST GPS',customerPhone:'000',area:'TEST',deliveryAddress:'TEST ADDRESS',fulfillmentType:'delivery',paymentMethod:'cash_on_delivery',deliveryCents:1,totalCents:1,deliveryLocation:{lat:-26.001,lon:28.001,accuracyM:5,capturedAt:Date.now()}};
  const dbForRequest=async(_,fn)=>{await f.db.exec('SET ROLE '+role);try{return await fn(f.db);}catch(error){await f.db.query('ROLLBACK');throw error;}finally{await f.db.exec('RESET ROLE');}};
  const send=body=>neonApi(new Request('https://kota-connect-api-dev.siboniisozulu.workers.dev/api/orders',{method:'POST',headers:{authorization:'Guest '+'ab'.repeat(32),'content-type':'application/json'},body:JSON.stringify(body)}),env,dbForRequest);
  const first=await send(payload);assert.equal(first.status,201);const created=await first.json();assert.equal(created.order.total_cents,3500);
  const quote=(await f.db.query('SELECT fee_cents,payout_cents,route_distance_m,weight_grams FROM kc_pending_delivery_quotes WHERE order_id=$1',[created.order.id])).rows[0];
  assert.deepEqual(quote,{fee_cents:1500,payout_cents:1000,route_distance_m:544,weight_grams:1000});
  assert.equal((await send(payload)).status,200);assert.equal(routes,1);
  assert.equal((await send({...payload,deliveryLocation:{...payload.deliveryLocation,lat:-26.002}})).status,409);
  delete env.KOTA_MAX_CYCLING_DISTANCE_M;delete env.KOTA_MAX_CYCLING_WEIGHT_G;
  assert.equal((await send({...payload,requestId:randomUUID()})).status,201,'no invented global caps; approved per-driver capacities govern dispatch');
  assert.equal(routes,2);
  env.KOTA_MAX_CYCLING_WEIGHT_G='invalid';
  assert.equal((await send({...payload,requestId:randomUUID()})).status,503,'explicitly misconfigured caps still fail closed');
  delete env.KOTA_MAX_CYCLING_WEIGHT_G;
  const now=Date.now();t.mock.method(Date,'now',()=>now+120000);
  assert.equal((await send(payload)).status,200,'committed guest orders remain retryable after GPS ages');
  assert.equal((await send({...payload,requestId:randomUUID()})).status,400,'new orders still require fresh GPS');
  assert.equal((await f.db.query('SELECT count(*)::int n FROM kc_orders WHERE client_request_id=$1',[payload.requestId])).rows[0].n,1);
  assert.equal(routes,2);
  await f.db.query('UPDATE kc_orders SET dropoff_lat=NULL,dropoff_lon=NULL,delivery_location_saved_at=NULL WHERE id=$1',[created.order.id]);
  assert.equal((await send({...payload,deliveryLocation:{...payload.deliveryLocation,lat:0,lon:0}})).status,409,'missing historical coordinates are not zero-valued coordinates');
  t.diagnostic('Actual handler/PostgreSQL fixture with restricted role; routing is synthetic, not a hosted provider or physical GPS result.');
 }finally{await f.db.query('ROLLBACK');await f.db.exec('RESET ROLE');await f.close();}
});
