import test from 'node:test';
import assert from 'node:assert/strict';
import {neonApi} from '../src/neon-api.js';
const base='https://kota-connect-api-dev.siboniisozulu.workers.dev';
const id='11111111-1111-4111-8111-111111111111';
const env=()=>({NEON_ONLY_MODE:'true',KOTA_STAGING_ROUTING_APPROVED:'true',KOTA_STAGING_DELIVERY_PROOFS_ENABLED:'true',KOTA_DELIVERY_ORDER_SYNC_ENABLED:'true',KOTA_STAGING_DISPATCH_RECOVERY_ENABLED:'true',DELIVERY_DISPATCH_ENABLED:'true',DELIVERY_SOURCE_LOOKUP_ENABLED:'true',DELIVERY_CALLBACKS_ENABLED:'true',DELIVERY_CALLBACK_SECRET:'callback'.repeat(8),KOTA_ROUTING_API_KEY:'fixture-routing-key',DELIVERY_LOOKUP_TOKEN:'lookup'.repeat(8),DELIVERY_INTAKE_SECRET:'intake'.repeat(8),DELIVERY_CF_ACCESS_CLIENT_ID:'fixture-client',DELIVERY_CF_ACCESS_CLIENT_SECRET:'fixture-private',DELIVERY_SERVICE_URL:'https://konexa-delivery-private-staging.pages.dev',EXPECTED_NEON_HOST:'ep-fixture.neon.tech',KOTA_DELIVERY_DATABASE_URL:'postgresql://kc_delivery_bridge:fixture@ep-fixture.neon.tech/neondb'});
const body=type=>({requestId:id,shopId:id,items:[{itemId:id,quantity:1}],customerName:'TEST unavailable delivery',customerPhone:'000',area:'TEST',deliveryAddress:'TEST ONLY',fulfillmentType:type});
const post=type=>new Request(base+'/api/orders',{method:'POST',headers:{authorization:'Guest '+'ab'.repeat(32),'content-type':'application/json'},body:JSON.stringify(body(type))});
test('private staging exposes only a boolean capability and fails closed on every missing prerequisite',async()=>{
 const ready=env();const run=e=>neonApi(new Request(base+'/api/delivery-capabilities'),e,()=>assert.fail('Capability must not touch database'));
 const enabled=await run(ready);assert.equal(enabled.status,200);assert.deepEqual(await enabled.json(),{delivery_available:true});
 for(const key of Object.keys(ready)){const missing={...ready};delete missing[key];const r=await run(missing);assert.equal(r.status,200);assert.deepEqual(await r.json(),{delivery_available:false},key);}
});
test('unconfigured private delivery cannot persist an unfulfillable order, including forced stale UI submissions',async()=>{
 let calls=0;const response=await neonApi(post('delivery'),{NEON_ONLY_MODE:'true'},()=>{calls++;throw Error('Unavailable delivery reached database');});
 assert.equal(response.status,503);assert.equal(calls,0);assert.match((await response.json()).error,/collect/i);
});
test('unavailable delivery does not prevent configured private guest collection checkout',async()=>{
 const db={query:async(sql)=>{
  if(sql.startsWith('SELECT id,order_number,status'))return {rows:[]};
  if(sql.startsWith('SELECT id,owner_subject'))return {rows:[{id,owner_subject:'fixture-owner'}]};
  if(sql.startsWith('SELECT id,name,price_cents'))return {rows:[{id,name:'TEST pickup',price_cents:100}]};
  if(sql.startsWith('INSERT INTO kc_orders('))return {rows:[{id,order_number:'TEST-PICKUP',status:'pending',total_cents:100}]};
  return {rows:[],rowCount:1};
 }};
 const r=await neonApi(post('pickup'),{NEON_ONLY_MODE:'true'},(_,fn)=>fn(db));assert.equal(r.status,201);assert.equal((await r.json()).order.total_cents,100);
});
