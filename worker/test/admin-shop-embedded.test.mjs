import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { postgresFixture } from './postgres-fixture.mjs';
import { adminShopManagement } from '../src/admin-shop-management.js';
test('SQL-backed shop management persists decisions/history and rolls back failed notifications',async()=>{
 const f=await postgresFixture(), shop=randomUUID(), env={KOTA_SHOP_ADMIN_ENABLED:'true'};
 const withDb=async(_,fn)=>fn(f.db);
 const call=(body,subject='fixture-admin',path=`/api/admin/shops/${shop}/approval`,method='PATCH')=>adminShopManagement(new Request('https://fixture.test'+path,{method,...(method==='GET'?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})}),env,withDb,subject);
 try{
  await f.db.query("INSERT INTO kc_admins(subject) VALUES('fixture-admin')");
  await f.db.query("INSERT INTO kc_shops(id,owner_subject,name,area,approved) VALUES($1,'fixture-owner','TEST managed shop','TEST area',true)",[shop]);
  assert.deepEqual(await(await call(null,'fixture-admin','/api/admin/shop-management','GET')).json(),{available:false});
  await f.db.exec(await readFile(new URL('../../neon/migrations/009_shop_admin_events.sql',import.meta.url),'utf8'));
  const decision={requestId:randomUUID(),approved:false,expectedCurrentApproved:true,reason:'TEST suspend'};
  assert.equal((await call(decision,'fixture-owner')).status,403);
  assert.equal((await call(decision)).status,200);
  const repeat=await call(decision);assert.equal(repeat.status,200);assert.equal((await repeat.json()).replayed,true);
  const status=async()=>({approved:(await f.db.query('SELECT approved FROM kc_shops WHERE id=$1',[shop])).rows[0].approved,events:(await f.db.query('SELECT count(*)::int n FROM kc_shop_admin_events')).rows[0].n,notifications:(await f.db.query('SELECT count(*)::int n FROM kc_notifications')).rows[0].n});
  assert.deepEqual(await status(),{approved:false,events:1,notifications:1});
  const events=await(await call(null,'fixture-admin',`/api/admin/shops/${shop}/approval-events`,'GET')).json();assert.equal(events.events.length,1);assert.equal(events.events[0].actor_subject,'fixture-admin');
  assert.equal((await call({...decision,reason:'Changed request'})).status,409);assert.equal((await call({...decision,requestId:randomUUID()})).status,409);
  await f.db.exec("ALTER TABLE kc_notifications ADD CONSTRAINT fixture_failure CHECK(body<>'TEST FAIL notification')");
  await assert.rejects(call({requestId:randomUUID(),approved:true,expectedCurrentApproved:false,reason:'TEST FAIL notification'}),{code:'23514'});
  assert.deepEqual(await status(),{approved:false,events:1,notifications:1});
  await assert.rejects(f.db.query("UPDATE kc_shop_admin_events SET reason='overwrite'"),{code:'42501'});
  await assert.rejects(f.db.query('DELETE FROM kc_shop_admin_events'),{code:'42501'});
 }finally{await f.close();}
});
