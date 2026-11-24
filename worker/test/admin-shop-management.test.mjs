import test from 'node:test';
import assert from 'node:assert/strict';
import { adminShopManagement } from '../src/admin-shop-management.js';
const shop='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const body=()=>({requestId:id,expectedCurrentApproved:true,approved:false,reason:'TEST suspend fixture'});
const req=(data=body(),path=`/api/admin/shops/${shop}/approval`,method='PATCH')=>new Request('https://fixture.test'+path,{method,headers:{'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(data)})});
function fixture({admin=true,enabled=true,approved=true,previous=null,missing=false,failNotification=false}={}){
 const queries=[];let writes=0;
 const db={query:async(sql,args=[])=>{
  queries.push({sql,args});
  if(sql.startsWith('SELECT 1 FROM kc_admins'))return {rows:admin?[{}]:[],rowCount:admin?1:0};
  if(sql.startsWith('SELECT id FROM kc_shop_admin_events LIMIT')){if(missing)throw Object.assign(Error('missing'),{code:'42P01'});return {rows:[]};}
  if(sql.includes('FROM kc_shop_admin_events WHERE actor_subject'))return {rows:previous?[previous]:[]};
  if(sql.includes('FROM kc_shops WHERE'))return {rows:[{id:shop,approved,owner_subject:'owner-fixture'}]};
  if(sql.startsWith('UPDATE kc_shops'))writes++;
  if(sql.startsWith('INSERT INTO kc_shop_admin_events'))return {rows:[{id,request_id:args[0],shop_id:args[1],actor_subject:args[2],previous_approved:args[3],approved:args[4],reason:args[5]}]};
  if(sql.startsWith('INSERT INTO kc_notifications')&&failNotification)throw Error('Fixture notification failure');
  return {rows:[],rowCount:1};
 }};
 return {queries,get writes(){return writes},env:{KOTA_SHOP_ADMIN_ENABLED:enabled?'true':'false'},withDb:async(_,fn)=>fn(db)};
}
test('shop management requires server-side admin and stays unavailable before explicit activation/schema',async()=>{
 const f=fixture({admin:false});assert.equal((await adminShopManagement(req(),f.env,f.withDb,'owner')).status,403);assert.equal(f.writes,0);
 const disabled=fixture({enabled:false});const response=await adminShopManagement(req(null,'/api/admin/shop-management','GET'),disabled.env,disabled.withDb,'admin');assert.deepEqual(await response.json(),{available:false});assert.equal(disabled.queries.length,1);
 const absent=fixture({missing:true});assert.deepEqual(await (await adminShopManagement(req(null,'/api/admin/shop-management','GET'),absent.env,absent.withDb,'admin')).json(),{available:false});
});
test('valid suspension locks shop then atomically records decision and existing-kind notification',async()=>{
 const f=fixture();const response=await adminShopManagement(req(),f.env,f.withDb,'admin');assert.equal(response.status,200);assert.equal((await response.json()).replayed,false);
 const sql=f.queries.map(q=>q.sql);assert(sql.indexOf('BEGIN')<sql.findIndex(s=>s.includes('FOR UPDATE')));assert(sql.findIndex(s=>s.includes('FOR UPDATE'))<sql.findIndex(s=>s.startsWith('UPDATE kc_shops')));assert(sql.some(s=>s.includes("'application_status'")));assert.equal(sql.at(-1),'COMMIT');
});
test('identical retry returns previous audit event without another state change or notification',async()=>{
 const previous={id,request_id:id,shop_id:shop,actor_subject:'admin',previous_approved:true,approved:false,reason:body().reason};
 const f=fixture({approved:false,previous});const response=await adminShopManagement(req(),f.env,f.withDb,'admin');assert.equal(response.status,200);assert.equal((await response.json()).replayed,true);assert.equal(f.writes,0);assert(!f.queries.some(q=>q.sql.startsWith('INSERT')));
 const conflict=fixture({previous});assert.equal((await adminShopManagement(req({...body(),reason:'Different'}),conflict.env,conflict.withDb,'admin')).status,409);assert.equal(conflict.writes,0);
});
test('stale and malformed decisions cannot change state; failures roll back atomically',async()=>{
 const stale=fixture({approved:false});assert.equal((await adminShopManagement(req(),stale.env,stale.withDb,'admin')).status,409);assert.equal(stale.writes,0);assert.equal(stale.queries.at(-1).sql,'ROLLBACK');
 for(const invalid of [{...body(),approved:'false'},{...body(),actor_subject:'attacker'},{...body(),reason:' '},{...body(),approved:true}]){const f=fixture();assert.equal((await adminShopManagement(req(invalid),f.env,f.withDb,'admin')).status,400);assert.equal(f.writes,0);}
 const fail=fixture({failNotification:true});await assert.rejects(adminShopManagement(req(),fail.env,fail.withDb,'admin'),/Fixture notification failure/);assert.equal(fail.queries.at(-1).sql,'ROLLBACK');
});
