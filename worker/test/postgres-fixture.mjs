import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { PGlite } from '@electric-sql/pglite';
export async function postgresFixture() {
 const connectionString=process.env.KOTA_LOCK_TEST_DATABASE_URL;
 let engine,db;
 if(connectionString){
  const target=new URL(connectionString);
  assert(['127.0.0.1','localhost','[::1]'].includes(target.hostname),'Refuse hosted database');
  assert.equal(target.pathname,'/kota_lock_test','Refuse non-fixture database');
  assert.equal(target.search,'','Refuse query parameters that could override fixture connection settings');
  engine=new Client({connectionString,connectionTimeoutMillis:5000});await engine.connect();
  db={query:(...args)=>engine.query(...args),exec:sql=>engine.query(sql)};
 }else{
  engine=new PGlite();db={exec:sql=>engine.exec(sql),query:async(...args)=>{const r=await engine.query(...args);return {...r,rowCount:r.rows.length||r.affectedRows||0};}};
 }
 const schema='kota_flow_'+randomUUID().replaceAll('-','');
 try{
  await db.exec(`CREATE SCHEMA ${schema}; SET search_path TO ${schema},public;`);
  for(const name of ['001_kota_connect.sql','002_order_status_events.sql','003_commission_ledger.sql','003_order_idempotency.sql','004_commission_integrity.sql','005_order_status_transitions.sql','006_admin_authorization.sql','007_fresh_shop_applications_notifications.sql','008_disable_launch_commission.sql']){
   const sql=await readFile(new URL('../../neon/migrations/'+name,import.meta.url),'utf8');
   // Only the fixture copy of the public-qualified idempotency table is relocated.
   await db.exec(sql.replaceAll('public.kc_orders',schema+'.kc_orders'));
  }
  return {db,schema,mode:connectionString?'LOCAL_POSTGRES':'EMBEDDED_POSTGRES',close:async()=>{try{await db.exec(`ROLLBACK; DROP SCHEMA ${schema} CASCADE;`);}finally{if(connectionString)await engine.end();else await engine.close();}}};
 }catch(error){if(connectionString)await engine.end();else await engine.close();throw error;}
}
