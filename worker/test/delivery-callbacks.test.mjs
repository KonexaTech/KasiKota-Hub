import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash,createHmac,randomUUID } from 'node:crypto';
import { deliveryEvents } from '../src/delivery-events.js';
import { deliveryFixture,orderId,jobId } from './delivery-fixture.mjs';
const secret='callback-secret-'.repeat(4),env={DELIVERY_CALLBACKS_ENABLED:'true',DELIVERY_CALLBACK_SECRET:secret};
function event(overrides={}){return {version:1,event_id:randomUUID(),sequence:'1',source_order_id:orderId,job_id:jobId,status:'searching',occurred_at:new Date().toISOString(),...overrides};}
function request(data,options={}){
 const body=JSON.stringify(data),timestamp=options.timestamp||String(Math.floor(Date.now()/1000));
 const canonical=['konexa-delivery-events-v1','POST','/internal/delivery/events','kota',timestamp,createHash('sha256').update(body).digest('hex')].join('\n');
 return new Request('https://staging.example/internal/delivery/events',{method:'POST',headers:{'x-konexa-source':'kota','x-konexa-delivery-timestamp':timestamp,'x-konexa-delivery-signature':'v1='+createHmac('sha256',options.secret||secret).update(canonical).digest('hex')},body});
}
test('callback guards reject disabled, forged, stale, malformed and oversized requests before SQL',async()=>{
 let reads=0;const db=()=>{reads++;throw Error('Must not connect');};
 assert.equal((await deliveryEvents(request(event()),{},db)).status,503);
 assert.equal((await deliveryEvents(request(event(),{secret:'wrong'}),env,db)).status,401);
 assert.equal((await deliveryEvents(request(event(),{timestamp:'1000000000'}),env,db)).status,401);
 assert.equal((await deliveryEvents(request(event({sequence:'0'})),env,db)).status,400);
 assert.equal((await deliveryEvents(request(event({extra:'unexpected'})),env,db)).status,400);
 assert.equal((await deliveryEvents(request(event({extra:'x'.repeat(17000)})),env,db)).status,413);
 assert.equal(reads,0);
});
test('real isolated SQL: callback persists, deduplicates, rejects conflicts and preserves merchant/financial state',async()=>{
 const f=await deliveryFixture();try{
 const send=data=>deliveryEvents(request(data),env,f.withDb),first=event();
 assert.equal((await send(first)).status,200);
 assert.equal((await send(first)).status,200);
 assert.equal((await send({...first,status:'assigned'})).status,409);
 assert.equal((await send(event({sequence:'1',status:'assigned'}))).status,409);
 assert.equal((await send(event({sequence:'3',status:'enroute'}))).status,200);
 assert.equal((await send(event({sequence:'2',status:'assigned'}))).status,200);
 assert.equal((await send(event({sequence:'4',status:'ready'}))).status,409);
 assert.equal((await send(event({sequence:'4',job_id:randomUUID()}))).status,409);
 assert.equal((await send(event({sequence:'4',status:'delivered'}))).status,200);
 assert.equal((await send(event({sequence:'5',status:'failed'}))).status,409);
 const state=(await f.db.query('SELECT * FROM kc_delivery_state')).rows[0];assert.equal(state.status,'delivered');assert.equal(String(state.sequence),'4');
 const count=(await f.db.query('SELECT count(*)::int AS count FROM kc_delivery_events')).rows[0].count;assert.equal(count,4);
 const order=(await f.db.query('SELECT status,total_cents,test_order FROM kc_orders WHERE id=$1',[orderId])).rows[0];assert.deepEqual(order,{status:'out_for_delivery',total_cents:100,test_order:true});
 assert.equal((await f.db.query('SELECT count(*)::int AS count FROM kc_commission_entries')).rows[0].count,0);
 const notifications=(await f.db.query("SELECT recipient_subject,kind,body FROM kc_notifications WHERE title='Delivery update'")).rows;assert.equal(notifications.length,6);assert(notifications.every(n=>n.kind==='order_status'));assert.equal(notifications.filter(n=>n.body.includes('no courier assignment')).length,2);
 }finally{await f.close();}
});
test('callback never acknowledges a failed durable commit',async()=>{
 const f=await deliveryFixture();try{
 const broken=async(_,fn)=>fn({query:async(sql,args)=>{if(sql==='COMMIT')throw Error('TEST private failure');return f.db.query(sql,args);}});
 const r=await deliveryEvents(request(event()),env,broken);assert.equal(r.status,503);assert(!JSON.stringify(await r.json()).includes('private'));
 assert.equal((await f.db.query('SELECT count(*)::int AS count FROM kc_delivery_events')).rows[0].count,0);
 }finally{await f.close();}
});
