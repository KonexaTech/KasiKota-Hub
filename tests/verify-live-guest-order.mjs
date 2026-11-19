// Live guest checkout and order-tracking acceptance against the Neon staging Worker.
// Creates one explicitly test-flagged delivery order; never prints customer or guest credentials.
import { randomBytes, randomUUID } from "node:crypto";
const base="https://kota-connect-api-dev.siboniisozulu.workers.dev";
const guestToken=randomBytes(32).toString("hex");
const otherGuestToken=randomBytes(32).toString("hex");
const headers={"accept":"application/json","authorization":"Guest "+guestToken,"content-type":"application/json"};
async function request(path,options={}){
 const response=await fetch(base+path,{signal:AbortSignal.timeout(15000),cache:"no-store",...options});
 const body=await response.json().catch(()=>null);
 return {status:response.status,body};
}
const health=await request("/api/health");
if(health.status!==200||health.body?.ok!==true||health.body?.backend!=="neon")throw Error("Neon staging API health failed");
const catalog=await request("/api/shops");
if(catalog.status!==200||!Array.isArray(catalog.body?.shops)||!catalog.body.shops.length)throw Error("Approved shop catalog is empty or unavailable");
let chosen=null;
for(const shop of catalog.body.shops){
 const menu=await request("/api/shops/"+encodeURIComponent(shop.id)+"/menu");
 if(menu.status===200&&Array.isArray(menu.body?.items)&&menu.body.items.length){chosen={shop,item:menu.body.items[0]};break}
}
if(!chosen)throw Error("No approved shop has an available menu item for the guest checkout test");
const requestId=randomUUID();
const payload={
 requestId,shopId:chosen.shop.id,items:[{itemId:chosen.item.id,quantity:1}],
 customerName:"Kota Connect Automated Test",customerPhone:"0000000000",
 area:chosen.shop.area||"Newcastle",fulfillmentType:"delivery",
 deliveryAddress:"Kota Connect automated test delivery, Newcastle"
};
const create=await request("/api/orders",{method:"POST",headers,body:JSON.stringify(payload)});
if(create.status!==201||!create.body?.order?.id)throw Error("Guest checkout did not create an order (HTTP "+create.status+")");
const orderId=create.body.order.id;
const expectedTotal=Number(chosen.item.price_cents)+500;
if(Number(create.body.order.total_cents)!==expectedTotal)throw Error("Backend delivery total is not menu price plus R5");
const replay=await request("/api/orders",{method:"POST",headers,body:JSON.stringify(payload)});
if(replay.status!==200||replay.body?.replayed!==true||replay.body?.order?.id!==orderId)throw Error("Identical checkout retry was not idempotent");
const tampered=await request("/api/orders",{method:"POST",headers,body:JSON.stringify({...payload,items:[{itemId:chosen.item.id,quantity:2}]})});
if(tampered.status!==409)throw Error("Reused request ID with changed items was not rejected");
const tracked=await request("/api/orders/"+encodeURIComponent(orderId),{headers});
if(tracked.status!==200||tracked.body?.order?.status!=="pending"||Number(tracked.body.order.total_cents)!==expectedTotal)throw Error("Customer tracking did not return the saved pending order");
const items=await request("/api/orders/"+encodeURIComponent(orderId)+"/items",{headers});
if(items.status!==200||items.body?.items?.length!==1||Number(items.body.items[0].unit_price_cents)!==Number(chosen.item.price_cents))throw Error("Saved order item snapshot is incorrect");
const history=await request("/api/orders/"+encodeURIComponent(orderId)+"/history",{headers});
if(history.status!==200||!history.body?.events?.some(event=>event.new_status==="pending"))throw Error("Order status history is missing the initial pending event");
const mine=await request("/api/orders/mine",{headers});
if(mine.status!==200||!mine.body?.orders?.some(order=>order.id===orderId))throw Error("Guest order history does not contain the new order");
const other=await request("/api/orders/"+encodeURIComponent(orderId),{headers:{authorization:"Guest "+otherGuestToken,accept:"application/json"}});
if(other.status!==403)throw Error("A different guest token could access another customer's order");
for(const route of ["/api/owner/orders","/api/admin/orders"]){
 const denied=await request(route,{headers:{authorization:"Guest "+guestToken,accept:"application/json"}});
 if(denied.status!==401)throw Error(route+" accepted a guest identity");
}
const anonymous=await request("/api/orders/mine");
if(anonymous.status!==401)throw Error("Unauthenticated order history was not rejected");
console.log(JSON.stringify({result:"PASS",shop:chosen.shop.name,menuItem:chosen.item.name,orderCreated:true,deliveryFeeCents:500,totalCents:expectedTotal,idempotentRetry:true,tamperedRetryRejected:true,tracking:true,items:true,history:true,guestIsolation:true,ownerAdminGuestDenied:true,testOrderFlagExpected:true}));
