// Relocated disposable SQL fixture only. The reviewed remote proposal is never executed by this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {postgresFixture} from './postgres-fixture.mjs';
import {adminShopManagement} from '../src/admin-shop-management.js';
test('proposed administrator grants and preserving rollback work without audit UPDATE/DELETE/TRUNCATE',async()=>{
 const f=await postgresFixture(),role='kc_admin_fixture_'+randomUUID().replaceAll('-','').slice(0,16),shop=randomUUID();
 let roleCreated=false;
 try{
  await f.db.exec('CREATE ROLE '+role+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');roleCreated=true;
  await f.db.exec('GRANT USAGE ON SCHEMA '+f.schema+' TO '+role+'; GRANT SELECT ON kc_shops,kc_admins TO '+role+'; GRANT INSERT(recipient_subject,kind,title,body) ON kc_notifications TO '+role);
  await f.db.query("INSERT INTO kc_admins(subject) VALUES('fixture-admin')");
  await f.db.query("INSERT INTO kc_shops(id,owner_subject,name,area,approved) VALUES($1,'fixture-owner','TEST managed','TEST',true)",[shop]);
  const database=(await f.db.query('SELECT current_database() name')).rows[0].name;
  assert(/^[a-zA-Z0-9_]+$/.test(database));
  const relocate=sql=>sql.replaceAll("'neondb'","'"+database+"'").replaceAll('public.',f.schema+'.').replace('search_path=public,pg_catalog','search_path='+f.schema+',pg_catalog').replaceAll('kc_staging_worker',role);
  const proposal=relocate(await readFile(new URL('../../docs/release/shop-admin-current.PROPOSED.sql',import.meta.url),'utf8'));
  await f.db.exec(proposal);
  await f.db.exec('SET ROLE '+role);
  const withDb=(_,fn)=>fn(f.db),env={KOTA_SHOP_ADMIN_ENABLED:'true'};
  const call=(body,path='/api/admin/shops/'+shop+'/approval',method='PATCH')=>adminShopManagement(new Request('https://fixture.test'+path,{method,...(method==='GET'?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})}),env,withDb,'fixture-admin');
  assert.deepEqual(await(await call(null,'/api/admin/shop-management','GET')).json(),{available:true});
  const result=await call({requestId:randomUUID(),approved:false,expectedCurrentApproved:true,reason:'TEST restricted suspension'});
  assert.equal(result.status,200);
  const events=(await f.db.query('SELECT * FROM kc_shop_admin_events')).rows;assert.equal(events.length,1);
  for(const sql of ["UPDATE kc_shop_admin_events SET reason='changed'","DELETE FROM kc_shop_admin_events","TRUNCATE kc_shop_admin_events"])
   await assert.rejects(f.db.exec(sql),{code:'42501'});
  assert.equal((await f.db.query("SELECT has_column_privilege(current_user,'"+f.schema+".kc_shops','approved','UPDATE') allowed")).rows[0].allowed,true);
  await f.db.exec('RESET ROLE');
  await f.db.exec(relocate(await readFile(new URL('../../docs/release/shop-admin-current.rollback.sql',import.meta.url),'utf8')));
  assert.equal((await f.db.query('SELECT count(*)::int n FROM kc_shop_admin_events')).rows[0].n,1,'Rollback must retain audit history');
  assert.equal((await f.db.query("SELECT has_column_privilege($1,$2,'approved','UPDATE') allowed",[role,f.schema+'.kc_shops'])).rows[0].allowed,false);
 }finally{
  await f.db.exec('RESET ROLE; ROLLBACK');
  if(roleCreated){
   const exists=(await f.db.query('SELECT to_regclass($1) value',[f.schema+'.kc_shop_admin_events'])).rows[0]?.value;
   if(exists)await f.db.exec('DROP POLICY IF EXISTS kc_shop_admin_read_runtime ON kc_shop_admin_events; DROP POLICY IF EXISTS kc_shop_admin_insert_runtime ON kc_shop_admin_events');
   await f.db.exec('DROP OWNED BY '+role+'; DROP ROLE '+role);
  }
  await f.close();
 }
});
