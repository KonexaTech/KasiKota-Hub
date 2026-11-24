// Transport-isolated regressions only: no staging writes are executed by this suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stagingAccessFetch } from './staging-access-fetch.mjs';
import { prepareFreshStagingRoleFixtures, writeFixtureOutputs } from './prepare-staging-role-fixtures.mjs';
const API='https://kota-connect-api-dev.siboniisozulu.workers.dev',SITE='https://kota-connect-neon-staging.pages.dev';
const app='11111111-1111-4111-8111-111111111111',shop='22222222-2222-4222-8222-222222222222',item='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444';
const env=()=>({KOTA_CF_ACCESS_CLIENT_ID:'fixture-client-id',KOTA_CF_ACCESS_CLIENT_SECRET:'fixture-client-secret',GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/feature/neon-only-cutover',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'123456',GITHUB_RUN_ATTEMPT:'1',KOTA_PREPARE_FRESH_TEST_SHOP:'true',KOTA_TEST_EXPECTED_SOURCE_COMMIT:'a'.repeat(40),KOTA_TEST_OWNER_EMAIL:'owner@fixture.example',KOTA_TEST_OWNER_PASSWORD:'not-real-owner-password',KOTA_TEST_ADMIN_EMAIL:'admin@fixture.example',KOTA_TEST_ADMIN_PASSWORD:'not-real-admin-password'});
function fixture(options={}){
 const calls=[];let application=null,menu=[];
 const fetchImpl=async(url,init={})=>{
  assert.equal(init.redirect,'manual','Never forward credentials through a redirect');
  assert.equal(init.headers['cf-access-client-id'],'fixture-client-id');
  assert.equal(init.headers['cf-access-client-secret'],'fixture-client-secret');
  const parsed=new URL(url);assert([API,SITE].includes(parsed.origin));const path=parsed.pathname,method=init.method||'GET',body=init.body?JSON.parse(init.body):null;
  calls.push({url,method,body,headers:init.headers});
  const reply=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...headers}});
  const isOwner=init.headers?.authorization==='Bearer fixture.owner.token';
  if(path==='/api/health')return reply({ok:true,backend:'neon',sourceCommit:options.stale?'b'.repeat(40):'a'.repeat(40)});
  if(path==='/auth/sign-in/email')return reply({ok:true},200,{'set-cookie':'fixture_session='+(body.email.startsWith('owner@')?'owner':'admin')+'; HttpOnly; Secure'});
  if(path==='/auth/get-session')return reply({user:{id:init.headers.cookie.includes('=owner')?'fixture-owner':'fixture-admin',email:options.wrongEmail?'other@fixture.example':init.headers.cookie.includes('=owner')?'owner@fixture.example':'admin@fixture.example',emailVerified:!options.unverified}});
  if(path==='/auth/token')return reply({token:init.headers.cookie.includes('=owner')?'fixture.owner.token':'fixture.admin.token'});
  if(path==='/api/me')return reply(isOwner?{subject:options.subjectMismatch?'different-owner':'fixture-owner',admin:false}:{subject:'fixture-admin',admin:!options.wrongRole});
  const marker='TEST Kota QA 123456-1';
  if(path==='/api/shop-applications/mine')return reply({applications:application?[{id:application.id,shop_name:options.ownNameMismatch?'Other application':application.shop_name,status:'pending'}]:options.reusedMarker?[{id:other,shop_name:marker,status:'pending'}]:[]});
  if(path==='/api/shop-applications'&&method==='POST'){application={id:app,shop_name:body.shopName,applicant_subject:'fixture-owner',status:'pending'};return reply({application:{id:app,status:'pending'}},201);}
  if(path==='/api/admin/shop-applications')return reply({applications:[{id:other,shop_name:'Genuine unrelated application',applicant_subject:'different-owner',status:'pending'},{...application,applicant_subject:options.otherOwner?'different-owner':'fixture-owner'}]});
  if(path==='/api/admin/shop-applications/'+app+'/review'&&method==='PATCH')return reply({ok:true});
  if(path==='/api/owner/shops')return reply({shops:[{id:other,name:'Existing merchant',approved:true},{id:shop,name:marker,approved:true,owner_subject:'fixture-owner'}]});
  if(path==='/api/owner/shops/'+shop+'/menu'&&method==='GET')return reply({items:options.unexpectedMenu&&menu.length===0?[{id:other,name:'Existing item',price_cents:500,available:true}]:menu});
  if(path==='/api/owner/shops/'+shop+'/menu'&&method==='POST'){menu=[{id:item,name:body.name,price_cents:body.priceCents,available:true}];return reply({item:menu[0]},201);}
  throw Error('Unexpected fixture request');
 };
 return {calls,fetchImpl,businessWrites:()=>calls.filter(call=>call.url.startsWith(API)&&call.method!=='GET')};
}
test('fresh-fixture creation requires explicit manual staging source and existing account inputs before any request',async()=>{
 for(const [key,value] of [['KOTA_CF_ACCESS_CLIENT_SECRET',''],['KOTA_CF_ACCESS_CLIENT_ID',''],['KOTA_PREPARE_FRESH_TEST_SHOP','false'],['GITHUB_REF','refs/heads/main'],['GITHUB_EVENT_NAME','push'],['GITHUB_ACTIONS','false'],['GITHUB_SHA','b'.repeat(40)],['GITHUB_RUN_ID','123\n456'],['GITHUB_RUN_ATTEMPT','0'],['KOTA_TEST_OWNER_PASSWORD',''],['KOTA_TEST_ADMIN_EMAIL','owner@fixture.example']]){
  const f=fixture();await assert.rejects(prepareFreshStagingRoleFixtures({...env(),[key]:value},{fetchImpl:f.fetchImpl}),/BLOCKED/);assert.equal(f.calls.length,0);
 }
});
test('wrong targets and stale deployed code cannot receive credentials or fixture writes',async()=>{
 for(const target of ['https://production.example','https://kota-connect-api-dev.siboniisozulu.workers.dev/other','https://secret@kota-connect-api-dev.siboniisozulu.workers.dev','https://kota-connect-api-dev.siboniisozulu.workers.dev?target=other']){
  const f=fixture();await assert.rejects(prepareFreshStagingRoleFixtures({...env(),KOTA_TEST_API_BASE:target},{fetchImpl:f.fetchImpl}),/BLOCKED/);assert.equal(f.calls.length,0);
 }
 const stale=fixture({stale:true});await assert.rejects(prepareFreshStagingRoleFixtures(env(),{fetchImpl:stale.fetchImpl}),/source commit/);assert.equal(stale.calls.length,1);assert.equal(stale.businessWrites().length,0);
});
test('unverified identities and role/subject mismatches cannot create an application',async()=>{
 for(const options of [{unverified:true},{wrongEmail:true},{wrongRole:true},{subjectMismatch:true}]){
  const f=fixture(options);await assert.rejects(prepareFreshStagingRoleFixtures(env(),{fetchImpl:f.fetchImpl}),/BLOCKED/);assert.equal(f.businessWrites().length,0);
 }
});
test('fresh fixture flow creates and approves only its new owned application and persisted TEST menu',async()=>{
 const f=fixture(),result=await prepareFreshStagingRoleFixtures(env(),{fetchImpl:f.fetchImpl});
 assert.deepEqual(result,{confirm_writes:'true',shop_id:shop,menu_item_id:item,owner_subject:'fixture-owner',admin_subject:'fixture-admin'});
 const writes=f.businessWrites();assert.equal(writes.length,3);assert(writes[0].body.shopName.startsWith('TEST Kota QA '));assert.equal(writes[1].url,API+'/api/admin/shop-applications/'+app+'/review');assert.equal(writes[2].url,API+'/api/owner/shops/'+shop+'/menu');assert.equal(writes[2].body.priceCents,100);
 assert(writes.every(call=>!call.url.includes(other)));assert(!f.calls.some(call=>/\/api\/orders|\/api\/admin\/users|\/api\/admin\/roles/.test(call.url)));
});
test('application ownership/name checks prevent approval of any other application',async()=>{
 for(const options of [{ownNameMismatch:true},{otherOwner:true}]){
  const f=fixture(options);await assert.rejects(prepareFreshStagingRoleFixtures(env(),{fetchImpl:f.fetchImpl}),/BLOCKED/);assert.equal(f.businessWrites().length,1);assert(!f.calls.some(call=>call.method==='PATCH'));
 }
});
test('an existing run marker is not inferred disposable or reused',async()=>{
 const f=fixture({reusedMarker:true});await assert.rejects(prepareFreshStagingRoleFixtures(env(),{fetchImpl:f.fetchImpl}),/already has an application/);assert.equal(f.businessWrites().length,0);
});
test('a nonempty fresh-shop menu is preserved rather than overwritten',async()=>{
 const f=fixture({unexpectedMenu:true});await assert.rejects(prepareFreshStagingRoleFixtures(env(),{fetchImpl:f.fetchImpl}),/no existing menu will be changed/);assert.equal(f.businessWrites().length,2);assert(!f.calls.some(call=>call.method==='POST'&&call.url.endsWith('/menu')));
});
test('GitHub outputs contain only validated fixture identifiers and reject extra secrets/newlines',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'kota-fresh-output-'));try{
  const f=fixture(),result=await prepareFreshStagingRoleFixtures(env(),{fetchImpl:f.fetchImpl});const path=join(dir,'outputs');await writeFixtureOutputs(path,result);
  const written=await readFile(path,'utf8');assert.equal(written.split('\n').filter(Boolean).length,5);assert(!written.includes('password'));assert(!written.includes('fixture.owner.token'));
  for(const bad of [{...result,owner_subject:'owner\nconfirm_writes=true'},{...result,token:'secret'},{...result,confirm_writes:'false'}])await assert.rejects(writeFixtureOutputs(path,bad),/validation/);
  assert.equal(await readFile(path,'utf8'),written);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('workflow keeps fixed-fixture mode and its existing staging branch guard',async()=>{
 const workflow=await readFile(new URL('../../.github/workflows/kota-live-role-acceptance.yml',import.meta.url),'utf8');
 assert.match(workflow,/create_fresh_test_shop:[\s\S]*?default: false/);assert.match(workflow,/github.ref == 'refs\/heads\/feature\/neon-only-cutover'/);assert.match(workflow,/github.event_name == 'workflow_dispatch' && inputs.create_fresh_test_shop/);
 for(const key of ['SHOP_ID','MENU_ITEM_ID','OWNER_SUBJECT','ADMIN_SUBJECT'])assert(workflow.includes('|| vars.KOTA_TEST_'+key));
 assert.match(workflow,/run: node worker\/test\/release-gates.integration.mjs/);
});

test('Access transport refuses foreign origins and never follows redirects',async()=>{
 const calls=[];const request=stagingAccessFetch(env(),async(url,init)=>{calls.push({url,init});return new Response(null,{status:302,headers:{location:'https://untrusted.example'}});});
 for(const target of ['https://untrusted.example','http://kota-connect-neon-staging.pages.dev','https://kota-connect-neon-staging.pages.dev.untrusted.example','https://user@kota-connect-neon-staging.pages.dev','https://kota-connect-neon-staging.pages.dev/#fragment'])await assert.rejects(request(target),/BLOCKED/);
 assert.equal(calls.length,0);
 const response=await request(SITE+'/auth/get-session',{headers:{cookie:'test-session', 'CF-Access-Client-Id':'untrusted-override'},redirect:'follow'});
 assert.equal(response.status,302);assert.equal(calls.length,1);assert.equal(calls[0].init.redirect,'manual');assert.equal(calls[0].init.headers['cf-access-client-id'],'fixture-client-id');assert.equal(calls[0].init.headers['cf-access-client-secret'],'fixture-client-secret');assert.equal(calls[0].init.headers.cookie,'test-session');
});
