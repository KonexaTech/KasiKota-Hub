import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash,createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {deliveryFixture} from './delivery-fixture.mjs';
import {deliveryEvents} from '../src/delivery-events.js';
const secret='isolated-callback-secret-'.repeat(3);
const env={DELIVERY_CALLBACKS_ENABLED:'true',DELIVERY_CALLBACK_SECRET:secret,KOTA_DELIVERY_ORDER_SYNC_ENABLED:'true'};
function signed(data){
 const body=JSON.stringify(data),timestamp=String(Math.floor(Date.now()/1000));
 const canonical=['konexa-delivery-events-v1','POST','/internal/delivery/events','kota',timestamp,createHash('sha256').update(body).digest('hex')].join('\n');
 return new Request('https://fixture.example/internal/delivery/events',{method:'POST',headers:{'x-konexa-source':'kota','x-konexa-delivery-timestamp':timestamp,'x-konexa-delivery-signature':'v1='+createHmac('sha256',secret).update(canonical).digest('hex')},body});
}
async function fixture(install=true){
 const f=await deliveryFixture(),id=randomUUID(),job=randomUUID(),role=f.schema+'_bridge';
 await f.db.query("INSERT INTO kc_orders(id,order_number,shop_id,customer_subject,customer_name,customer_phone,area,fulfillment_type,subtotal_cents,delivery_cents,total_cents,test_order) SELECT $1,'TEST-SYNC',shop_id,'guest:sync','TEST','000','TEST','delivery',1000,1500,2500,true FROM kc_orders LIMIT 1",[id]);
 for(const status of ['accepted','preparing','ready_for_collection'])await f.db.query('UPDATE kc_orders SET status=$1 WHERE id=$2',[status,id]);
 await f.db.query("INSERT INTO kc_delivery_dispatches(order_id,job_id,intake_status) VALUES($1,$2,'searching')",[id,job]);
 await f.db.exec(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA ${f.schema} TO ${role};`);
 if(install){
  const sql=await readFile(new URL('../../docs/release/driver-order-sync.PROPOSED.sql',import.meta.url),'utf8');
  await f.db.exec(sql.replaceAll('public.',f.schema+'.').replaceAll('pg_catalog,public','pg_catalog,'+f.schema).replaceAll('kc_delivery_bridge',role));
 }
 await f.db.exec(`GRANT SELECT(id,fulfillment_type,customer_subject,shop_id) ON kc_orders TO ${role};
 GRANT SELECT(id,owner_subject) ON kc_shops TO ${role};
 GRANT SELECT ON kc_delivery_dispatches,kc_delivery_events,kc_delivery_state TO ${role};
 GRANT INSERT ON kc_delivery_events,kc_delivery_state TO ${role};
 GRANT UPDATE(sequence,status,occurred_at) ON kc_delivery_state TO ${role};
 GRANT INSERT(recipient_subject,order_id,kind,title,body) ON kc_notifications TO ${role};
 CREATE POLICY sync_read ON kc_delivery_dispatches FOR SELECT TO ${role} USING(true);
 CREATE POLICY sync_read ON kc_delivery_events FOR SELECT TO ${role} USING(true);
 CREATE POLICY sync_write ON kc_delivery_events FOR INSERT TO ${role} WITH CHECK(true);
 CREATE POLICY sync_read ON kc_delivery_state FOR SELECT TO ${role} USING(true);
 CREATE POLICY sync_write ON kc_delivery_state FOR INSERT TO ${role} WITH CHECK(true);
 CREATE POLICY sync_update ON kc_delivery_state FOR UPDATE TO ${role} USING(true) WITH CHECK(true);`);
 const withDb=async(_,fn)=>{await f.db.exec('SET ROLE '+role);try{return await fn(f.db);}finally{await f.db.exec('RESET ROLE');}};
 return {...f,id,job,role,withDb,event:(sequence,status)=>({version:1,event_id:randomUUID(),sequence:String(sequence),source_order_id:id,job_id:job,status,occurred_at:new Date().toISOString()}),close:f.close};
}
test('restricted callback role synchronizes collection and verified completion atomically without order UPDATE grants',async()=>{
 const f=await fixture();try{
  await f.db.exec('SET ROLE '+f.role);
  await assert.rejects(f.db.query('UPDATE kc_orders SET status=\'completed\' WHERE id=$1',[f.id]),e=>e.code==='42501');
  await assert.rejects(f.db.query('SELECT customer_name FROM kc_orders WHERE id=$1',[f.id]),e=>e.code==='42501');
  await f.db.exec('RESET ROLE');
  const send=e=>deliveryEvents(signed(e),env,f.withDb),collected=f.event(1,'collected');
  assert.equal((await send(collected)).status,200);
  assert.equal((await send(collected)).status,200,'lost acknowledgement retry must not duplicate history');
  assert.equal((await f.db.query('SELECT status FROM kc_orders WHERE id=$1',[f.id])).rows[0].status,'out_for_delivery');
  assert.equal((await send(f.event(2,'enroute'))).status,200);
  const delivered=f.event(3,'delivered');assert.equal((await send(delivered)).status,200);assert.equal((await send(delivered)).status,200);
  const order=(await f.db.query('SELECT status,total_cents,test_order FROM kc_orders WHERE id=$1',[f.id])).rows[0];
  assert.deepEqual(order,{status:'completed',total_cents:2500,test_order:true});
  const history=(await f.db.query('SELECT new_status,actor_role FROM kc_order_status_events WHERE order_id=$1 ORDER BY created_at,id',[f.id])).rows;
  assert.deepEqual(history.map(x=>x.new_status),['out_for_delivery','completed']);assert(history.every(x=>x.actor_role==='system'));
  assert.equal((await f.db.query('SELECT count(*)::int n FROM kc_commission_entries WHERE order_id=$1',[f.id])).rows[0].n,0);
  await f.db.exec('SET ROLE '+f.role);
  assert.equal((await f.db.query('SELECT kc_apply_staging_delivery_event($1,$2,$3) applied',[f.id,randomUUID(),randomUUID()])).rows[0].applied,false);
  await f.db.exec('RESET ROLE');
 }finally{await f.close();}
});
test('missing approved synchronization RPC cannot acknowledge an event or retain partial tracking updates',async()=>{
 const f=await fixture(false);try{
  const response=await deliveryEvents(signed(f.event(1,'collected')),env,f.withDb);assert.equal(response.status,503);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM kc_delivery_events WHERE order_id=$1',[f.id])).rows[0].n,0);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM kc_delivery_state WHERE order_id=$1',[f.id])).rows[0].n,0);
  assert.equal((await f.db.query('SELECT status FROM kc_orders WHERE id=$1',[f.id])).rows[0].status,'ready_for_collection');
 }finally{await f.close();}
});
test('reviewed synchronization rollback restores the prior trigger without deleting orders or delivery records',async()=>{
 const f=await fixture();try{
  const before=(await f.db.query('SELECT count(*)::int n FROM kc_orders')).rows[0].n;
  const rollback=await readFile(new URL('../../docs/release/driver-order-sync.rollback.sql',import.meta.url),'utf8');
  await f.db.exec(rollback.replaceAll('public.',f.schema+'.'));
  assert.equal((await f.db.query('SELECT count(*)::int n FROM kc_orders')).rows[0].n,before);
  assert.equal((await f.db.query('SELECT status FROM kc_orders WHERE id=$1',[f.id])).rows[0].status,'ready_for_collection');
  assert.equal((await f.db.query("SELECT to_regprocedure($1) AS fn",[f.schema+'.kc_apply_staging_delivery_event(uuid,uuid,uuid)'])).rows[0].fn,null);
  await assert.rejects(f.db.query("UPDATE kc_orders SET status='out_for_delivery' WHERE id=$1",[f.id]),e=>e.code==='P0001');
 }finally{await f.close();}
});
