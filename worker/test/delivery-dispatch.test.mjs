import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash,createHmac,randomUUID } from 'node:crypto';
import { dispatchDelivery,deliveryTracking,deliveryCapabilities,recoverPendingDispatches } from '../src/delivery-dispatch.js';
import { guestRouteAllowed } from '../src/guest-auth.js';
import { deliveryFixture,orderId,jobId } from './delivery-fixture.mjs';
const secret='intake-secret-'.repeat(4),env={DELIVERY_DISPATCH_ENABLED:'true',DELIVERY_SOURCE_LOOKUP_ENABLED:'true',DELIVERY_LOOKUP_TOKEN:'lookup-'.repeat(8),DELIVERY_INTAKE_SECRET:secret,DELIVERY_CF_ACCESS_CLIENT_ID:'fake-client-id',DELIVERY_CF_ACCESS_CLIENT_SECRET:'fake-client-secret',DELIVERY_SERVICE_URL:'https://delivery.example',NEON_AUTH_URL:'https://auth.example',EXPECTED_NEON_HOST:'ep-lively-leaf-za5rtfhs.c-2.eu-west-2.aws.neon.tech'};
test('owner dispatch capability stays hidden until the dedicated bridge DB role is configured',()=>{
 assert.equal(deliveryCapabilities(env).dispatch_enabled,false);
 const bridgeUrl='postgresql://kc_delivery_bridge:fake-test-password@ep-lively-leaf-za5rtfhs.c-2.eu-west-2.aws.neon.tech/neondb?sslmode=require';
 assert.equal(deliveryCapabilities({...env,KOTA_DELIVERY_DATABASE_URL:bridgeUrl}).dispatch_enabled,true);
});
test('dispatch remains OFF without all explicit server configuration and rejects unsafe endpoints before SQL',async()=>{
 let reads=0;const db=()=>{reads++;throw Error('Must not connect');};
 for(const config of [{},{...env,DELIVERY_DISPATCH_ENABLED:'false'},{...env,DELIVERY_SERVICE_URL:'http://delivery.example'},{...env,DELIVERY_SERVICE_URL:'https://delivery.example/other'},{...env,DELIVERY_SOURCE_LOOKUP_ENABLED:'false'},{...env,DELIVERY_CF_ACCESS_CLIENT_ID:''},{...env,DELIVERY_CF_ACCESS_CLIENT_SECRET:''}])assert.equal((await dispatchDelivery(config,db,orderId,'owner')).status,503);
 assert.equal(reads,0);
});
test('real isolated SQL: authorized idempotent signed dispatch and guest-safe persistent tracking',async()=>{
 const f=await deliveryFixture(),originalFetch=globalThis.fetch;let requests=0;
 globalThis.fetch=async(url,options)=>{
 requests++;assert.equal(url,'https://delivery.example/v1/delivery/jobs');assert.equal(options.redirect,'error');assert.equal(options.headers['CF-Access-Client-Id'],env.DELIVERY_CF_ACCESS_CLIENT_ID);assert.equal(options.headers['CF-Access-Client-Secret'],env.DELIVERY_CF_ACCESS_CLIENT_SECRET);assert.deepEqual(JSON.parse(options.body),{version:1,source_order_id:orderId});
 const h=options.headers;assert.equal(h['x-konexa-source'],'kota');
 const canonical=['konexa-delivery-v1','POST','/v1/delivery/jobs','kota',h['x-konexa-timestamp'],createHash('sha256').update(options.body).digest('hex')].join('\n');
 assert.equal(h['x-konexa-signature'],'v1='+createHmac('sha256',secret).update(canonical).digest('hex'));
 return Response.json({job_id:jobId,status:'searching'},{status:201});
 };
 try{
 assert.equal((await dispatchDelivery(env,f.withDb,orderId,'other-owner')).status,404);assert.equal(requests,0);
 assert.equal((await dispatchDelivery(env,f.withDb,orderId,'guest:opaque-customer')).status,404);
 const r=await dispatchDelivery(env,f.withDb,orderId,'owner');assert.equal(r.status,201);const body=await r.json();assert.equal(body.delivery.queued,true);assert.match(body.delivery.message,/no courier assignment/);
 assert.equal((await dispatchDelivery(env,f.withDb,orderId,'owner')).status,200);assert.equal(requests,1);
 const visible=await deliveryTracking(env,f.withDb,orderId,'guest:opaque-customer');assert.equal(visible.status,200);assert.equal((await visible.json()).delivery.status,'searching');
 assert.equal((await deliveryTracking(env,f.withDb,orderId,'other-customer')).status,404);
 assert.equal(guestRouteAllowed('GET','/api/orders/'+orderId+'/delivery'),true);assert.equal(guestRouteAllowed('POST','/api/owner/orders/'+orderId+'/delivery'),false);
 assert.equal((await f.db.query('SELECT count(*)::int AS count FROM kc_delivery_dispatches')).rows[0].count,1);
 assert.equal((await f.db.query('SELECT status FROM kc_orders WHERE id=$1',[orderId])).rows[0].status,'out_for_delivery');
 }finally{globalThis.fetch=originalFetch;await f.close();}
});
test('failed or conflicting intake is retryable and cannot pin fake jobs',async()=>{
 const f=await deliveryFixture(),originalFetch=globalThis.fetch;
 try{
 globalThis.fetch=async()=>Response.json({job_id:randomUUID(),status:'paid'});
 assert.equal((await dispatchDelivery(env,f.withDb,orderId,'owner')).status,502);
 globalThis.fetch=async()=>{throw Error('interrupted network');};assert.equal((await dispatchDelivery(env,f.withDb,orderId,'owner')).status,503);
 globalThis.fetch=async()=>Response.json({error:'conflict'},{status:409});assert.equal((await dispatchDelivery(env,f.withDb,orderId,'owner')).status,409);
 assert.equal((await f.db.query('SELECT count(*)::int AS count FROM kc_delivery_dispatches')).rows[0].count,0);
 }finally{globalThis.fetch=originalFetch;await f.close();}
});

test('lost remote ACK and local notification failure retry one remote job and one committed association',async()=>{
 const f=await deliveryFixture(),originalFetch=globalThis.fetch;let calls=0,createdJobs=0,remoteJob=null;
 globalThis.fetch=async()=>{calls++;if(!remoteJob){remoteJob=jobId;createdJobs++;throw Error('TEST lost acknowledgement after remote accept');}return Response.json({job_id:remoteJob,status:'searching'});};
 try{
 assert.equal((await dispatchDelivery(env,f.withDb,orderId,'owner')).status,503);
 await f.db.exec("ALTER TABLE kc_notifications ADD CONSTRAINT reject_delivery_fixture CHECK(title<>'Delivery update')");
 assert.equal((await dispatchDelivery(env,f.withDb,orderId,'owner')).status,503);
 assert.equal((await f.db.query('SELECT count(*)::int AS count FROM kc_delivery_dispatches')).rows[0].count,0);
 assert.equal((await f.db.query('SELECT count(*)::int AS count FROM kc_notifications')).rows[0].count,0);
 await f.db.exec('ALTER TABLE kc_notifications DROP CONSTRAINT reject_delivery_fixture');
 assert.equal((await dispatchDelivery(env,f.withDb,orderId,'owner')).status,201);
 assert.equal((await dispatchDelivery(env,f.withDb,orderId,'owner')).status,200);
 assert.equal(calls,3);assert.equal(createdJobs,1);
 assert.equal((await f.db.query('SELECT count(*)::int AS count FROM kc_delivery_dispatches')).rows[0].count,1);
 const n=(await f.db.query('SELECT recipient_subject,body FROM kc_notifications')).rows;assert.equal(n.length,2);assert(n.every(x=>x.body.includes('no courier assignment confirmed')));
 }finally{globalThis.fetch=originalFetch;await f.close();}
});

test('recovery remains disabled without both staging flags and complete dispatch config',async()=>{
 const forbidden=()=>{throw Error('Unexpected database access')};
 for(const config of [env,{...env,KOTA_STAGING_ROUTING_APPROVED:'true'},{...env,KOTA_STAGING_DISPATCH_RECOVERY_ENABLED:'true'},{KOTA_STAGING_ROUTING_APPROVED:'true',KOTA_STAGING_DISPATCH_RECOVERY_ENABLED:'true'}])assert.deepEqual(await recoverPendingDispatches(config,forbidden),{attempted:0,accepted:0});
});
test('recovery scans only approved staging COD orders without dispatch records, in bounded batches',async()=>{
 let calls=0;const db=async(_env,fn)=>fn({query:async(sql)=>{calls++;for(const clause of ['o.test_order','s.approved','q.dispatch_ready','q.cash_on_delivery_approved','d.order_id IS NULL','LIMIT 3',"o.status='ready_for_collection'"])assert.ok(sql.includes(clause));return {rows:[]};}});
 assert.deepEqual(await recoverPendingDispatches({...env,KOTA_STAGING_ROUTING_APPROVED:'true',KOTA_STAGING_DISPATCH_RECOVERY_ENABLED:'true'},db),{attempted:0,accepted:0});assert.equal(calls,1);
});
