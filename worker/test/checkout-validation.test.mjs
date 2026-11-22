import test from 'node:test';
import assert from 'node:assert/strict';
import { neonApi } from '../src/neon-api.js';

const shopId='11111111-1111-4111-8111-111111111111';
const itemId='22222222-2222-4222-8222-222222222222';
const requestId='33333333-3333-4333-8333-333333333333';
const valid=()=>({requestId,shopId,items:[{itemId,quantity:2}],fulfillmentType:'delivery',customerName:'Test Customer',customerPhone:'0700000000',area:'Newcastle',deliveryAddress:'Test Street'});
const request=body=>new Request('https://kota-connect-api-dev.siboniisozulu.workers.dev/api/orders',{method:'POST',headers:{'content-type':'application/json',authorization:'Guest '+'ab'.repeat(32)},body:JSON.stringify(body)});

test('malformed checkout is rejected before database work, including nullable items and non-string addresses',async()=>{
  const cases=[
    {...valid(),items:[null]},
    {...valid(),items:[{...valid().items[0],itemId:[itemId]}]},
    {...valid(),requestId:[requestId]},
    {...valid(),shopId:[shopId]},
    {...valid(),deliveryAddress:{street:'Test Street'}},
    {...valid(),deliveryAddress:123},
    {...valid(),deliveryAddress:'   '},
    {...valid(),fulfillmentType:'pickup',deliveryAddress:{street:'Test Street'}},
    {...valid(),items:[{itemId,quantity:0}]},
  ];
  for(const body of cases){
    let queries=0;
    const response=await neonApi(request(body),{},async()=>{queries++;throw Error('Invalid checkout reached database');});
    assert.equal(response.status,400,JSON.stringify(body));
    assert.equal(queries,0);
  }
});

test('guest checkout prices come from server menu and preserve delivery details in one transaction',async()=>{
  const calls=[];
  let inserted;
  const db={query:async(sql,params=[])=>{
    calls.push(sql);
    if(sql.startsWith('SELECT id,order_number,status'))return {rows:[]};
    if(sql.startsWith('SELECT id,owner_subject'))return {rows:[{id:shopId,owner_subject:'owner-fixture'}]};
    if(sql.startsWith('SELECT id,name,price_cents'))return {rows:[{id:itemId,name:'Test Kota',price_cents:2500}]};
    if(sql.startsWith('INSERT INTO kc_orders(')){inserted=params;return {rows:[{id:'44444444-4444-4444-8444-444444444444',order_number:'TEST-ORDER',status:'pending',total_cents:5500}]};}
    return {rows:[],rowCount:1};
  }};
  const body={...valid(),totalCents:1,items:[{itemId,quantity:2,priceCents:1}]};
  const response=await neonApi(request(body),{},(_env,callback)=>callback(db));
  assert.equal(response.status,201);
  assert.equal(inserted[8],5000);
  assert.equal(inserted[9],500);
  assert.equal(inserted[10],5500);
  assert.equal(inserted[6],'Test Street');
  assert.equal(inserted[11],true,'development orders must remain test orders');
  assert.equal(calls[0],'BEGIN');
  assert.equal(calls.at(-1),'COMMIT');
  assert.equal(calls.filter(sql=>sql.startsWith('INSERT INTO kc_order_items')).length,1);
});

test('identical retry returns existing order without duplicate writes; changed address conflicts',async()=>{
  const body=valid();
  const existing={id:'44444444-4444-4444-8444-444444444444',shop_id:shopId,customer_name:body.customerName,customer_phone:body.customerPhone,area:body.area,delivery_address:body.deliveryAddress,fulfillment_type:'delivery',status:'pending',total_cents:5500};
  for(const changed of [false,true]){
    const writes=[];
    const db={query:async(sql)=>{
      if(sql.startsWith('SELECT id,order_number,status'))return {rows:[existing]};
      if(sql.startsWith('SELECT menu_item_id'))return {rows:[{id:itemId,quantity:2}]};
      writes.push(sql);return {rows:[]};
    }};
    const response=await neonApi(request({...body,deliveryAddress:changed?'Other Street':body.deliveryAddress}),{},(_env,callback)=>callback(db));
    assert.equal(response.status,changed?409:200);
    assert.ok(!writes.some(sql=>/INSERT|UPDATE/.test(sql)));
    assert.equal(writes.at(-1),changed?'ROLLBACK':'COMMIT');
  }
});
