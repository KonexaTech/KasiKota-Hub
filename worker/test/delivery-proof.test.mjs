import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {deliveryProof} from '../src/delivery-proof.js';
import {neonApi} from '../src/neon-api.js';
import {verifiedGuestSubject} from '../src/guest-auth.js';
const base='https://kota-connect-api-dev.siboniisozulu.workers.dev',id='11111111-1111-4111-8111-111111111111';
const env={NEON_ONLY_MODE:'true',KOTA_STAGING_DELIVERY_PROOFS_ENABLED:'true',DELIVERY_DISPATCH_ENABLED:'true',DELIVERY_SERVICE_URL:'https://konexa-delivery-private-staging.pages.dev',DELIVERY_INTAKE_SECRET:'fixture-only-'.repeat(4),DELIVERY_CF_ACCESS_CLIENT_ID:'fixture-id',DELIVERY_CF_ACCESS_CLIENT_SECRET:'fixture-secret'};
const row={customer_subject:'fixture-customer',owner_subject:'fixture-owner',test_order:true,approved:true,fulfillment_type:'delivery',status:'ready_for_collection'};
const request=(body='{}',origin=base)=>new Request(origin+'/api/orders/'+id+'/delivery-verification',{method:'POST',body,headers:{'content-type':'application/json'}});
const db=value=>async(_,fn)=>fn({query:async(sql,args)=>{assert(sql.startsWith('SELECT'));assert.deepEqual(args,[id]);return {rows:value?[value]:[]};}});
test('merchant/customer proof is authorized from the actual order and only fixed signed fields leave the Worker',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  calls++;assert.equal(url,env.DELIVERY_SERVICE_URL+'/v1/delivery/source-verification');assert.equal(init.redirect,'manual');
  assert.equal(init.headers.authorization,undefined);assert.equal(init.headers['CF-Access-Client-Secret'],env.DELIVERY_CF_ACCESS_CLIENT_SECRET);
  const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body).sort(),['purpose','source_order_id','version']);
  const canonical=['konexa-delivery-proof-v1','POST','/v1/delivery/source-verification','kota',init.headers['x-konexa-timestamp'],createHash('sha256').update(init.body).digest('hex')].join('\n');
  assert.equal(init.headers['x-konexa-signature'],'v1='+createHmac('sha256',env.DELIVERY_INTAKE_SECRET).update(canonical).digest('hex'));
  return Response.json({pin:'012345',purpose:body.purpose,expires_in:900,private_field:'must-not-return'});
 });
 for(const [purpose,subject] of [['collection','fixture-owner'],['handover','fixture-customer']]){
  const r=await deliveryProof(request(),env,db(row),id,subject,purpose);assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{pin:'012345',purpose,expires_in:900});assert.equal(r.headers.get('cache-control'),'no-store');
 }
 for(const [purpose,subject] of [['collection','fixture-customer'],['handover','fixture-owner'],['handover','intruder']])
  assert.equal((await deliveryProof(request(),env,db(row),id,subject,purpose)).status,404);
 for(const change of [{test_order:false},{approved:false},{fulfillment_type:'pickup'},{status:'completed'}])
  assert.equal((await deliveryProof(request(),env,db({...row,...change}),id,'fixture-customer','handover')).status,409);
 assert.equal(calls,2);
});
test('disabled, malformed and foreign environments never issue; redirects/errors cannot expose a code or secrets',async t=>{
 let calls=0,status=302; t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({pin:'123456',private:'upstream-detail'},{status});});
 for(const patch of [{KOTA_STAGING_DELIVERY_PROOFS_ENABLED:'false'},{NEON_ONLY_MODE:'false'},{DELIVERY_SERVICE_URL:'https://foreign.example'},{DELIVERY_INTAKE_SECRET:''}]){
  assert.equal((await deliveryProof(request(),{...env,...patch},()=>assert.fail(),id,'fixture-customer','handover')).status,503);
 }
 assert.equal((await deliveryProof(request('{}','https://production.example'),env,()=>assert.fail(),id,'fixture-customer','handover')).status,503);
 for(const body of ['[]','{"subject":"intruder"}','{"pin":"123456"}','invalid',' '.repeat(129)])
  assert.equal((await deliveryProof(request(body),env,()=>assert.fail(),id,'fixture-customer','handover')).status,400);
 assert.equal(calls,0);
 for(status of [302,409,500,200]){
  const r=await deliveryProof(request(),env,db(row),id,'fixture-customer','handover');assert([409,502,503].includes(r.status));
  const value=JSON.stringify(await r.json());assert(!value.includes('123456'));assert(!value.includes('upstream-detail'));
 }
});
test('guest route grants only the matching hashed customer a handover code and never access to owner issuance',async t=>{
 const auth='Guest '+'ab'.repeat(32),req=()=>new Request(base+'/api/orders/'+id+'/delivery-verification',{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:'{}'});
 const subject=await verifiedGuestSubject(req());let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({pin:'123456',purpose:'handover',expires_in:900});});
 assert.equal((await neonApi(req(),env,db({...row,customer_subject:subject}))).status,200);
 assert.equal((await neonApi(req(),env,db(row))).status,404);
 const owner=new Request(base+'/api/owner/orders/'+id+'/delivery-verification',{method:'POST',headers:{authorization:auth},body:'{}'});
 assert.equal((await neonApi(owner,env,()=>assert.fail('Guest reached owner DB'))).status,401);
 assert.equal((await neonApi(request(),env,()=>assert.fail('Anonymous reached DB'))).status,401);
 assert.equal(calls,1);
});
