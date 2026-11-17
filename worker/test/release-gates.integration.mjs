// End-to-end release-gate checks against an isolated Kota Connect staging Worker.
// Never point this test at production. It creates one staging pickup order and completes it.
import assert from "node:assert/strict";

const base = process.env.KOTA_API_BASE || "https://kota-connect-api-dev.siboniisozulu.workers.dev";
const host = new URL(base).hostname;
if (!host.endsWith(".workers.dev") || !host.startsWith("kota-connect-api-dev.")) {
  throw new Error("Safety stop: integration tests may only target the kota-connect-api-dev Worker.");
}
const env = {
  customer: process.env.KOTA_TEST_CUSTOMER_TOKEN,
  otherCustomer: process.env.KOTA_TEST_OTHER_CUSTOMER_TOKEN,
  owner: process.env.KOTA_TEST_OWNER_TOKEN,
  otherOwner: process.env.KOTA_TEST_OTHER_OWNER_TOKEN,
  admin: process.env.KOTA_TEST_ADMIN_TOKEN,
  shop: process.env.KOTA_TEST_SHOP_ID,
  menu: process.env.KOTA_TEST_MENU_ITEM_ID,
};
for (const [key,value] of Object.entries(env)) {
  if (!value) throw new Error("Missing required staging test variable: "+key);
}
const request = async (path, token, method="GET", body) => {
  const response = await fetch(base.replace(/\/$/,"")+path,{
    method,
    headers:{...(token?{authorization:"Bearer "+token}:{}),"content-type":"application/json"},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const payload = await response.json().catch(()=>({}));
  return {status:response.status,payload};
};
const expect = (actual,status,label) => {
  assert.equal(actual.status,status,label+" (response: "+JSON.stringify(actual.payload)+")");
  return actual.payload;
};

const created = expect(await request("/api/orders",env.customer,"POST",{
  shop_id:env.shop,customer_name:"Kota Connect staging test",customer_phone:"0000000000",
  area:"Staging test area",fulfillment_type:"pickup",
  items:[{menu_item_id:env.menu,quantity:1}]
}),201,"Customer can place a pickup order");
const orderId=created.order?.id;
assert.ok(orderId,"Order creation returns an order ID");

let tracked=expect(await request("/api/orders/"+orderId,env.customer),200,"Customer can track own order");
assert.equal(tracked.order.status,"pending","New order begins pending");
assert.equal(tracked.order.history?.length,1,"Initial pending event is recorded");

const ownerList=expect(await request("/api/owner/orders",env.owner),200,"Owner can load incoming orders");
assert.ok(ownerList.orders.some(o=>o.id===orderId),"Shop owner sees new order in dashboard feed");
const ownerNotices=expect(await request("/api/notifications",env.owner),200,"Owner can load order notifications");
assert.ok(ownerNotices.notifications.some(n=>n.order_id===orderId&&n.kind==="new_order"),"Owner receives in-app new-order notification");

for (const status of ["accepted","preparing","ready_for_collection","completed"]) {
  expect(await request("/api/owner/orders/"+orderId+"/status",env.owner,"PATCH",{status,note:"Release-gate staging test"}),200,"Owner can set "+status);
  tracked=expect(await request("/api/orders/"+orderId,env.customer),200,"Customer can refresh tracking after "+status);
  assert.equal(tracked.order.status,status,"Customer sees "+status);
  assert.equal(tracked.order.history.at(-1).new_status,status,"Status history records "+status);\n  const customerNotices=expect(await request("/api/notifications",env.customer),200,"Customer can load own status notifications");\n  assert.ok(customerNotices.notifications.some(n=>n.order_id===orderId&&n.kind==="order_status"),"Customer receives status-change notification");
}

const adminOrders=expect(await request("/api/admin/orders",env.admin),200,"Admin can monitor all orders");
const adminOrder=adminOrders.orders.find(o=>o.id===orderId);
assert.ok(adminOrder,"Admin can see the completed order");
assert.equal(adminOrder.status,"completed","Admin sees final order status");
assert.ok(Array.isArray(adminOrder.items)&&adminOrder.items.length===1,"Admin sees line-item details");
assert.ok(Array.isArray(adminOrder.history)&&adminOrder.history.length>=5,"Admin sees full status history");

expect(await request("/api/orders/"+orderId,env.otherCustomer),404,"Other customer cannot read this order");\nexpect(await request("/api/orders/"+orderId,null),401,"Unauthenticated user cannot track an order");\nexpect(await request("/api/orders",null,"POST",{}),401,"Unauthenticated user cannot create an order");
expect(await request("/api/orders/"+orderId,env.otherOwner),404,"Other shop owner cannot read this order");
expect(await request("/api/owner/orders/"+orderId+"/status",env.otherOwner,"PATCH",{status:"completed"}),404,"Other shop owner cannot update this order");
expect(await request("/api/owner/orders/"+orderId+"/status",env.customer,"PATCH",{status:"completed"}),404,"Customer cannot update owner order status");
const otherOwnerOrders=expect(await request("/api/owner/orders",env.otherOwner),200,"Other owner can load only their own order list");
assert.ok(!otherOwnerOrders.orders.some(o=>o.id===orderId),"Other owner order list excludes this order");
expect(await request("/api/admin/orders",null),401,"Unauthenticated user cannot access admin orders");
expect(await request("/api/owner/orders",null),401,"Unauthenticated user cannot access owner orders");

console.log(JSON.stringify({result:"PASS",orderId,gates:{
 customerOrderCreated:true,ownerReceivedOrder:true,ownerStatusTransitions:true,
 customerTrackingHistory:true,adminFullOrderVisibility:true,
 customerAndOwnerIsolation:true,unauthenticatedAccessDenied:true
}},null,2));
