// Real PostgreSQL integration for the admin module, never a hosted database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { adminShopManagement } from '../src/admin-shop-management.js';
const connectionString=process.env.KOTA_LOCK_TEST_DATABASE_URL;
test('PostgreSQL admin decisions persist, deduplicate concurrently, audit and roll back together', {skip:!connectionString?'BLOCKED: disposable local PostgreSQL fixture not configured':false,timeout:20000},async()=>{
 const url=new URL(connectionString);
 assert(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert.equal(url.pathname,'/kota_lock_test');assert.equal(url.search,'','No connection parameter may override the local fixture guard');
 const pool=new Pool({connectionString,max:4,connectionTimeoutMillis:4000});
 const schema='kota_admin_'+randomUUID().replaceAll('-',''),shop=randomUUID();
 let created=false;
 const withDb=async(_,fn)=>{const db=await pool.connect();try{await db.query(`SET search_path TO ${schema},public`);return await fn(db);}finally{db.release();}};
 const call=(body,actor='admin-fixture',path=`/api/admin/shops/${shop}/approval`,method='PATCH')=>adminShopManagement(new Request('https://fixture.test'+path,{method,...(method==='GET'?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})}),{KOTA_SHOP_ADMIN_ENABLED:'true'},withDb,actor);
 try {
  await pool.query(`CREATE SCHEMA ${schema}`);created=true;
  await withDb({},async db=>{
   await db.query('CREATE TABLE kc_admins(subject text PRIMARY KEY); CREATE TABLE kc_shops(id uuid PRIMARY KEY,owner_subject text NOT NULL,approved boolean NOT NULL); CREATE TABLE kc_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipient_subject text NOT NULL,kind text NOT NULL CHECK(kind IN(\'new_order\',\'order_status\',\'application_status\')),title text NOT NULL,body text NOT NULL)');
   await db.query("INSERT INTO kc_admins VALUES('admin-fixture'),('second-admin-fixture')");await db.query("INSERT INTO kc_shops VALUES($1,'owner-fixture',true)",[shop]);
  });
  assert.equal((await call(null,'owner-fixture','/api/admin/shop-management','GET')).status,403);
  assert.deepEqual(await(await call(null,'admin-fixture','/api/admin/shop-management','GET')).json(),{available:false});
  await withDb({},db=>db.query(readFileSync(new URL('../../neon/migrations/009_shop_admin_events.sql',import.meta.url),'utf8')));
  assert.deepEqual(await(await call(null,'admin-fixture','/api/admin/shop-management','GET')).json(),{available:true});
  const decision={requestId:randomUUID(),approved:false,expectedCurrentApproved:true,reason:'TEST suspended fixture'};
  const [first,second]=await Promise.all([call(decision),call(decision)]);
  assert.equal(first.status,200);assert.equal(second.status,200);
  assert.deepEqual([Boolean((await first.json()).replayed),Boolean((await second.json()).replayed)].sort(),[false,true]);
  const snapshot=()=>withDb({},async db=>({shop:(await db.query('SELECT approved FROM kc_shops WHERE id=$1',[shop])).rows[0].approved,events:(await db.query('SELECT count(*)::int n FROM kc_shop_admin_events')).rows[0].n,notifications:(await db.query('SELECT count(*)::int n FROM kc_notifications')).rows[0].n}));
  assert.deepEqual(await snapshot(),{shop:false,events:1,notifications:1});
  assert.equal((await call({...decision,reason:'Altered retry'})).status,409);
  assert.equal((await call({...decision,requestId:randomUUID()},'second-admin-fixture')).status,409);
  const resume={requestId:randomUUID(),approved:true,expectedCurrentApproved:false,reason:'TEST resumed fixture'};
  assert.equal((await call(resume)).status,200);assert.deepEqual(await snapshot(),{shop:true,events:2,notifications:2});
  const history=await(await call(null,'admin-fixture',`/api/admin/shops/${shop}/approval-events`,'GET')).json();assert.equal(history.events.length,2);assert(history.events.every(row=>row.actor_subject==='admin-fixture'));
  assert.equal((await call(null,'owner-fixture',`/api/admin/shops/${shop}/approval-events`,'GET')).status,403);
  await withDb({},db=>db.query("ALTER TABLE kc_notifications ADD CONSTRAINT fixture_failure CHECK(body<>'TEST FAIL notification')"));
  await assert.rejects(call({...decision,requestId:randomUUID(),reason:'TEST FAIL notification'}),{code:'23514'});
  assert.deepEqual(await snapshot(),{shop:true,events:2,notifications:2},'notification failure must roll back shop and audit writes');
  await withDb({},async db=>{
   await assert.rejects(db.query("UPDATE kc_shop_admin_events SET reason='changed'"),{code:'42501'});
   await assert.rejects(db.query('DELETE FROM kc_shop_admin_events'),{code:'42501'});
  });
 }finally{if(created)await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();}
});
