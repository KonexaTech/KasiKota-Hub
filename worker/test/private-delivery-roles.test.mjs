import test from 'node:test';
import assert from 'node:assert/strict';
import {roleConfig,verifyPrivateRoles} from './private-delivery-roles.mjs';
const env={DELIVERY_TEST_CONFIRM_PRIVATE_ROLES:'true',DELIVERY_TEST_EXPECTED_SOURCE:'a'.repeat(40),DELIVERY_TEST_ACCESS_CLIENT_ID:'fixture-id',DELIVERY_TEST_ACCESS_CLIENT_SECRET:'fixture-access'};
for(const role of ['ADMIN','DRIVER','OTHER_DRIVER'])Object.assign(env,{['DELIVERY_TEST_'+role+'_EMAIL']:role.toLowerCase()+'@fixture.test',['DELIVERY_TEST_'+role+'_PASSWORD']:'fixture-private-password'});
test('missing, foreign, duplicate or unapproved private role configuration cannot initiate network calls',async()=>{
 for(const change of [{DELIVERY_TEST_DRIVER_PASSWORD:''},{DELIVERY_TEST_BASE:'https://production.example'},{DELIVERY_TEST_CONFIRM_PRIVATE_ROLES:'false'},{DELIVERY_TEST_ADMIN_EMAIL:env.DELIVERY_TEST_DRIVER_EMAIL},{DELIVERY_TEST_ACCESS_CLIENT_ID:'bad\nheader'}]){
  let calls=0;await assert.rejects(verifyPrivateRoles({...env,...change},{fetcher:()=>{calls++;}}));assert.equal(calls,0);
 }
 assert.equal(roleConfig(env).accounts.length,3);
});
test('isolated transport fixture exercises cleanup and role checks without exposing any secret or mutating driver/job data',async()=>{
 const active=new Set(),logs=[],paths=[];
 const fetcher=async(url,init)=>{
  const u=new URL(url),h=init.headers;paths.push([u.pathname,init.method||'GET']);
  assert.equal(u.origin,'https://konexa-delivery-private-staging.pages.dev');assert.equal(init.redirect,'manual');
  if(!h.has('CF-Access-Client-Id'))return new Response(null,{status:302});
  assert.equal(h.get('CF-Access-Client-Secret'),env.DELIVERY_TEST_ACCESS_CLIENT_SECRET);
  const token=h.get('authorization'),cookie=h.get('cookie'),role=cookie?.replace('session=','')||token?.split('.')[1];
  if(u.pathname==='/v1/health')return Response.json({ok:true,sourceCommit:env.DELIVERY_TEST_EXPECTED_SOURCE,payments_enabled:false});
  if(u.pathname==='/auth/sign-in/email'){
   const b=JSON.parse(init.body);if(b.password!==env.DELIVERY_TEST_ADMIN_PASSWORD)return Response.json({error:'wrong'},{status:401});
   const key=b.email.split('@')[0].toUpperCase();active.add(key);return Response.json({}, {headers:{'set-cookie':'session='+key+'; HttpOnly'}});
  }
  if(u.pathname==='/auth/get-session')return Response.json(active.has(role)?{user:{emailVerified:true}}:null);
  if(u.pathname==='/auth/token')return Response.json({token:'head.'+role+'.signature'});
  if(u.pathname==='/auth/sign-out'){active.delete(role);return Response.json({ok:true});}
  if(!token||!token.endsWith('.signature'))return Response.json({error:'unauthorized'},{status:401});
  if(u.pathname==='/v1/me')return Response.json({source:'delivery',administrator:role==='ADMIN'});
  if(u.pathname==='/v1/admin/drivers')return Response.json({}, {status:role==='ADMIN'?200:403});
  if(u.pathname==='/v1/driver')return Response.json({driver:{id:role,approval_status:'approved',vehicle_type:'bicycle'}});
  assert.fail('Unexpected route');
 };
 await verifyPrivateRoles(env,{fetcher,log:x=>logs.push(x)});assert.equal(active.size,0);assert.equal(logs.length,2);
 assert(paths.filter(([p,m])=>m!=='GET').every(([p])=>p.startsWith('/auth/')));
 for(const value of Object.values(env).filter(v=>v.includes('fixture')))assert(!logs.join('\n').includes(value));
});
