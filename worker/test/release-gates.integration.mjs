// Full authenticated staging acceptance. Requires dedicated CI guest tokens and verified owner/admin JWTs.
// No credentials or personal data are logged. Orders created on the dev Worker are test_order=true.
import { randomUUID } from "node:crypto";
const base=process.env.KOTA_TEST_API_BASE||"https://kota-connect-api-dev.siboniisozulu.workers.dev";
const env={
 customer:process.env.KOTA_TEST_CUSTOMER_TOKEN,
 otherCustomer:process.env.KOTA_TEST_OTHER_CUSTOMER_TOKEN,
 owner:process.env.KOTA_TEST_OWNER_TOKEN,
 otherOwner:process.env.KOTA_TEST_OTHER_OWNER_TOKEN,
 admin:process.env.KOTA_TEST_ADMIN_TOKEN,
 shop:process.env.KOTA_TEST_SHOP_ID,
 menu:process.env.KOTA_TEST_MENU_ITEM_ID
};
for(const key of ["customer","otherCustomer","owner","otherOwner","admin","shop","menu"])
 if(!env[key])throw Error("Missing required staging test setting: "+key);
for(const key of ["customer","otherCustomer"])
 if(!/^[a-f0-9]{64}$/i.test(env[key]))throw Error(key+" must be a 64-character guest token, not a customer account JWT");
function authorization(principal){
 const token=env[principal].replace(/^(?:Bearer|Guest)\s+/i,"");
 return principal==="customer"||principal==="otherCustomer"?"Guest "+token:"Bearer "+token;
}
async function call(path,principal,method="GET",body){
 const headers={accept:"application/json"};
 if(principal)headers.authorization=authorization(principal);
 if(body!==undefined)headers["content-type"]="application/json";
 const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),cache:"no-store"});
 const data=await response.json().catch(()=>null);
 return {status:response.status,data};
}
function expect(result,status,path){
 if(result.status!==status)throw Error(path+" expected HTTP "+status+", received "+result.status+" ("+(result.data?.error||"no error detail")+")");
 return result.data;
}
const health=expect(await call("/api/health"),200,"health");
if(health.ok!==true||health.backend!=="neon")throw Error("Staging API is not connected to Neon");
const payload=()=>({
 requestId:randomUUID(),shopId:env.shop,items:[{itemId:env.menu,quantity:1}],
 customerName:"Kota Connect integration test",customerPhone:"0000000000",
 area:"Newcastle CBD",fulfillmentType:"pickup",deliveryAddress:""
});
const created=expect(await call("/api/orders","customer","POST",payload()),201,"create order");
const orderId=created.order?.id;
if(!orderId)throw Error("Created order response has no ID");
const sameRequest={requestId:created.order.request_id||null};
const original=payload();
const retry=expect(await call("/api/orders","customer","POST",original),201,"second independent order");
const secondOrderId=retry.order?.id;
if(!secondOrderId)throw Error("Second order response has no ID");
const duplicate=expect(await call("/api/orders","customer","POST",original),200,"idempotent retry");
if(duplicate.replayed!==true||duplicate.order?.id!==secondOrderId)throw Error("Duplicate request was not replayed");
const changed=expect(await call("/api/orders","customer","POST",{...original,items:[{itemId:env.menu,quantity:2}]}),409,"tampered retry");
if(!changed.error)throw Error("Changed idempotency payload did not return an error");
const ownerOrders=expect(await call("/api/owner/orders","owner"),200,"owner orders");
if(!ownerOrders.orders?.some(o=>o.id===orderId)||!ownerOrders.orders?.some(o=>o.id===secondOrderId))throw Error("Owner cannot see the shop's new orders");
const otherOwnerOrders=expect(await call("/api/owner/orders","otherOwner"),200,"other owner orders");
if(otherOwnerOrders.orders?.some(o=>o.id===orderId||o.id===secondOrderId))throw Error("Other owner can see this shop's orders");
expect(await call("/api/orders/"+orderId,"otherCustomer"),403,"other customer tracking");
expect(await call("/api/orders/"+orderId,"otherOwner"),403,"other owner tracking");
expect(await call("/api/owner/orders/"+orderId+"/status","customer","PATCH",{status:"accepted",note:"guest must not update status"}),401,"customer status update");
expect(await call("/api/owner/orders/"+orderId+"/status","otherOwner","PATCH",{status:"accepted",note:"other owner must not update status"}),404,"other owner status update");
for(const status of ["accepted","preparing","ready_for_collection","completed"]){
 expect(await call("/api/owner/orders/"+orderId+"/status","owner","PATCH",{status,note:"Automated staging status test"}),200,"owner status "+status);
 const tracked=expect(await call("/api/orders/"+orderId,"customer"),200,"customer tracking "+status);
 if(tracked.order?.status!==status)throw Error("Customer tracking did not reflect owner status "+status);
}
const items=expect(await call("/api/orders/"+orderId+"/items","customer"),200,"customer line items");
if(items.items?.length!==1)throw Error("Customer cannot read their saved line-item snapshot");
const history=expect(await call("/api/orders/"+orderId+"/history","customer"),200,"customer status history");
for(const status of ["pending","accepted","preparing","ready_for_collection","completed"])
 if(!history.events?.some(event=>event.new_status===status))throw Error("Order history is missing "+status);
const customerNotifications=expect(await call("/api/notifications","customer"),200,"customer notifications");
if(!customerNotifications.notifications?.some(n=>n.kind==="order_status"&&n.order_id===orderId))throw Error("Customer status notifications are missing");
const ownerNotifications=expect(await call("/api/notifications","owner"),200,"owner notifications");
if(!ownerNotifications.notifications?.some(n=>n.kind==="new_order"&&n.order_id===orderId))throw Error("Owner new-order notification is missing");
const adminOrders=expect(await call("/api/admin/orders","admin"),200,"admin order oversight");
if(!adminOrders.orders?.some(o=>o.id===orderId)||!adminOrders.orders?.some(o=>o.id===secondOrderId))throw Error("Admin cannot see the shop's orders");
expect(await call("/api/orders/"+orderId+"/items","admin"),200,"admin order items");
expect(await call("/api/orders/"+orderId+"/history","admin"),200,"admin order history");
const overview=expect(await call("/api/admin/overview","admin"),200,"admin overview");
if(overview.commissionPaused!==true||overview.estimatedCommissionCents!==0)throw Error("Launch commission is not paused");
const rejectedPayload=payload();
rejectedPayload.requestId=randomUUID();
const rejected=expect(await call("/api/orders","otherCustomer","POST",rejectedPayload),201,"create rejection test order");
const rejectedId=rejected.order?.id;
expect(await call("/api/owner/orders/"+rejectedId+"/status","owner","PATCH",{status:"rejected",note:"Automated rejection test"}),200,"owner reject order");
const rejectedTrack=expect(await call("/api/orders/"+rejectedId,"otherCustomer"),200,"rejected customer tracking");
if(rejectedTrack.order?.status!=="rejected")throw Error("Rejected order status did not reach customer tracking");
expect(await call("/api/orders/"+rejectedId,"customer"),403,"other guest rejected-order isolation");
for(const route of ["/api/owner/orders","/api/admin/orders"])
 expect(await call(route,null),401,"anonymous "+route);
console.log("PASS: guest ordering, idempotency, owner isolation, status transitions, customer tracking, notifications, admin oversight, rejection flow and paused commission");
