// Manual, explicitly approved, staging-only guest checkout and tracking test.
// Does not select an arbitrary merchant or create any order without strict scope.
// The staging API marks orders as test_order on its dedicated hostname.
import { randomBytes, randomUUID } from 'node:crypto';
import { approvedGuestTestConfig, assertGuestTestHealth, approvedGuestTestShop, approvedGuestTestMenuItem } from './guest-staging-guard.mjs';

const config=approvedGuestTestConfig(process.env); // Must pass before any network call.
const base=config.apiBase;
const guestToken=randomBytes(32).toString('hex');
const otherGuestToken=randomBytes(32).toString('hex');
const headers={accept:'application/json',authorization:'Guest '+guestToken,'content-type':'application/json'};
async function request(path,options={}) {
  const response=await fetch(base+path,{signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'manual',...options});
  const body=await response.json().catch(()=>null);
  return {status:response.status,body};
}

const health=await request('/api/health');
if(health.status!==200)throw Error('BLOCKED: isolated staging health endpoint is not ready.');
assertGuestTestHealth(config,health.body);
const catalog=await request('/api/shops');
if(catalog.status!==200)throw Error('BLOCKED: staging shop catalog is unavailable.');
const shop=approvedGuestTestShop(config,catalog.body?.shops);
const menu=await request('/api/shops/'+encodeURIComponent(shop.id)+'/menu');
if(menu.status!==200)throw Error('BLOCKED: approved test shop menu is unavailable.');
const item=approvedGuestTestMenuItem(config,menu.body?.items);
const chosen={shop,item}; // Never fall back to a different shop or item.

const requestId=randomUUID();
const payload={
  requestId,shopId:chosen.shop.id,items:[{itemId:chosen.item.id,quantity:1}],
  customerName:'TEST Kota Connect guest acceptance',customerPhone:'0000000000',
  area:chosen.shop.area||'Newcastle',fulfillmentType:'delivery',
  deliveryAddress:'TEST ONLY - no real collection or delivery, Newcastle'
};
const create=await request('/api/orders',{method:'POST',headers,body:JSON.stringify(payload)});
if(create.status!==201||!create.body?.order?.id)throw Error('Guest checkout did not create a staged TEST order (HTTP '+create.status+')');
const orderId=create.body.order.id;
const expectedTotal=Number(chosen.item.price_cents)+500;
if(Number(create.body.order.total_cents)!==expectedTotal)throw Error('Backend delivery total is not item price plus current R5 staging fee');
const replay=await request('/api/orders',{method:'POST',headers,body:JSON.stringify(payload)});
if(replay.status!==200||replay.body?.replayed!==true||replay.body?.order?.id!==orderId)throw Error('Identical guest retry was not idempotent');
const tampered=await request('/api/orders',{method:'POST',headers,body:JSON.stringify({...payload,items:[{itemId:chosen.item.id,quantity:2}]})});
if(tampered.status!==409)throw Error('Tampered checkout with reused request ID was not rejected');
const tracked=await request('/api/orders/'+encodeURIComponent(orderId),{headers});
if(tracked.status!==200||tracked.body?.order?.status!=='pending'||Number(tracked.body.order.total_cents)!==expectedTotal)throw Error('Guest tracking did not return the pending test order');
const items=await request('/api/orders/'+encodeURIComponent(orderId)+'/items',{headers});
if(items.status!==200||items.body?.items?.length!==1||Number(items.body.items[0].unit_price_cents)!==Number(chosen.item.price_cents))throw Error('Saved order item price snapshot was not preserved');
const history=await request('/api/orders/'+encodeURIComponent(orderId)+'/history',{headers});
if(history.status!==200||!history.body?.events?.some(e=>e.new_status==='pending'))throw Error('Missing initial guest order status event');
const mine=await request('/api/orders/mine',{headers});
if(mine.status!==200||!mine.body?.orders?.some(order=>order.id===orderId))throw Error('Guest order history is unavailable');
const other=await request('/api/orders/'+encodeURIComponent(orderId),{headers:{authorization:'Guest '+otherGuestToken,accept:'application/json'}});
if(other.status!==403)throw Error('Other guest identity could access a different customer order');
for(const route of ['/api/owner/orders','/api/admin/orders']) {
  const denied=await request(route,{headers:{authorization:'Guest '+guestToken,accept:'application/json'}});
  if(denied.status!==401)throw Error('Guest identity was allowed into a privileged route');
}
const anonymous=await request('/api/orders/mine');
if(anonymous.status!==401)throw Error('Unauthenticated guest history was not denied');
console.log(JSON.stringify({result:'PASS',testShop:true,testMenuItem:true,orderCreated:true,sourceCommitVerified:true,deliveryFeeCents:500,totalCents:expectedTotal,idempotentRetry:true,tamperedRetryRejected:true,tracking:true,history:true,guestIsolation:true,privilegedRoutesDenied:true,stagingTestOrderExpected:true}));
