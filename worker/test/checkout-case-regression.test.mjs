import test from 'node:test';
import assert from 'node:assert/strict';
import { neonApi } from '../src/neon-api.js';
const shop='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', item='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const valid=()=>({requestId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',shopId:shop,items:[{itemId:item,quantity:1}],customerName:'TEST customer',customerPhone:'0000000000',area:'TEST area',fulfillmentType:'pickup',deliveryAddress:''});
const req=body=>new Request('https://kota-connect-api-dev.siboniisozulu.workers.dev/api/orders',{method:'POST',headers:{'content-type':'application/json',authorization:'Guest '+'ab'.repeat(32)},body:JSON.stringify(body)});
test('uppercase UUID checkout uses canonical IDs for server prices and retains retry identity',async()=>{
 const body=valid();body.requestId=body.requestId.toUpperCase();body.shopId=body.shopId.toUpperCase();body.items[0].itemId=body.items[0].itemId.toUpperCase();
 let inserted;const calls=[];
 const db={query:async(sql,args=[])=>{calls.push({sql,args});if(sql.startsWith('SELECT id,order_number,status'))return {rows:[]};if(sql.startsWith('SELECT id,owner_subject'))return {rows:[{id:shop,owner_subject:'fixture-owner'}]};if(sql.startsWith('SELECT id,name,price_cents'))return {rows:[{id:item,name:'TEST item',price_cents:2500}]};if(sql.startsWith('INSERT INTO kc_orders(')){inserted=args;return {rows:[{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',status:'pending',total_cents:2500}]};}return {rows:[],rowCount:1};}};
 const response=await neonApi(req(body),{},(_,fn)=>fn(db));assert.equal(response.status,201);assert.equal(inserted[1],shop);assert.equal(inserted[12],valid().requestId);assert.equal(inserted[8],2500);assert.equal(calls.at(-1).sql,'COMMIT');
});
test('equivalent uppercase retries return persisted order without duplicate records',async()=>{
 const body=valid();body.shopId=shop.toUpperCase();body.items[0].itemId=item.toUpperCase();let writes=0;
 const row={id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',shop_id:shop,customer_name:body.customerName,customer_phone:body.customerPhone,area:body.area,delivery_address:null,fulfillment_type:'pickup',status:'pending',total_cents:2500};
 const db={query:async(sql)=>{if(sql.startsWith('INSERT')||sql.startsWith('UPDATE'))writes++;if(sql.startsWith('SELECT id,order_number,status'))return {rows:[row]};if(sql.startsWith('SELECT menu_item_id'))return {rows:[{id:item,quantity:1}]};return {rows:[]};}};
 const response=await neonApi(req(body),{},(_,fn)=>fn(db));assert.equal(response.status,200);assert.equal((await response.json()).replayed,true);assert.equal(writes,0);
});
test('required customer contact and area cannot be blank',async()=>{
 for(const field of ['customerPhone','area'])for(const value of ['', '   ']){
 const body={...valid(),[field]:value};let dbCalls=0;const response=await neonApi(req(body),{},()=>{dbCalls++;throw Error('Invalid contact reached persistence');});assert.equal(response.status,400);assert.equal(dbCalls,0);
 }
});
