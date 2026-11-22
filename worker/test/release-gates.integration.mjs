// Real customer-owner-admin acceptance on the isolated dev Worker and Neon staging.
// Requires only verified staging owner/admin credentials stored as Actions environment secrets.
 fix/kota-real-role-e2e-20261119
// Generates fresh anonymous guest secrets; discovers the approved owner's shop and menu.
// Never prints passwords, session cookies, JWTs, account IDs, or customer tokens.
// All orders created through the dev Worker are flagged as test orders.
import { randomBytes, randomUUID } from "node:crypto";

const base=process.env.KOTA_TEST_API_BASE||"https://kota-connect-api-dev.siboniisozulu.workers.dev";

// Uses an explicit approved fixture allowlist; never selects an arbitrary owner shop.
// Never prints passwords, session cookies, JWTs, account IDs, or customer tokens.
// All orders created through the dev Worker are flagged as test orders.
import { randomBytes, randomUUID } from "node:crypto";
import { liveAcceptanceConfig, assertCandidateHealth, assertFixturePrincipals, selectFixtureShop, selectFixtureMenuItem } from "./live-acceptance-guard.mjs";

let base=process.env.KOTA_TEST_API_BASE||"https://kota-connect-api-dev.siboniisozulu.workers.dev";
 feature/neon-only-cutover
const site="https://kota-connect-neon-staging.pages.dev";
if(new URL(base).origin!=="https://kota-connect-api-dev.siboniisozulu.workers.dev")
 throw Error("Refusing to create test orders outside the dedicated Kota Connect development Worker.");

const required={
 ownerEmail:process.env.KOTA_TEST_OWNER_EMAIL,
 ownerPassword:process.env.KOTA_TEST_OWNER_PASSWORD,
 adminEmail:process.env.KOTA_TEST_ADMIN_EMAIL,
 adminPassword:process.env.KOTA_TEST_ADMIN_PASSWORD
};
const missing=Object.entries(required).filter(([,value])=>!value).map(([name])=>name);
if(missing.length)throw Error(
 "BLOCKED: Full authenticated role acceptance requires four staging-only GitHub Actions environment secrets: "+
 "KOTA_TEST_OWNER_EMAIL, KOTA_TEST_OWNER_PASSWORD, KOTA_TEST_ADMIN_EMAIL, KOTA_TEST_ADMIN_PASSWORD. "+
 "Missing "+missing.length+" secret(s). Do not treat this workflow as passed."
);
 fix/kota-real-role-e2e-20261119

const fixtureConfig = liveAcceptanceConfig(process.env);
base=fixtureConfig.apiBase;
 feature/neon-only-cutover
const env={
 customer:randomBytes(32).toString("hex"),
 otherCustomer:randomBytes(32).toString("hex"),
 owner:null,admin:null,shop:null,menu:null
};
function authorization(principal){
 const token=env[principal];
 if(typeof token!=="string")throw Error("No authenticated staging principal for "+principal);
 return principal==="customer"||principal==="otherCustomer"?"Guest "+token:"Bearer "+token;
}
async function call(path,principal,method="GET",body){
 const headers={accept:"application/json"};
 if(principal)headers.authorization=authorization(principal);
 if(body!==undefined)headers["content-type"]="application/json";
 const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000),cache:"no-store"});
 const data=await response.json().catch(()=>null);
 return {status:response.status,data};
}
function expect(result,status,path){
 if(result.status!==status)throw Error(path+" expected HTTP "+status+", received "+result.status+
  " ("+(typeof result.data?.error==="string"?result.data.error.slice(0,150):"no detail")+")");
 return result.data;
}
// Same-origin Neon Auth sign-in; the cookie is used only to obtain a short-lived signed JWT.
// No browser-readable cookie is needed and nothing is written to repository configuration.
async function signedJwt(email,password,label){
 const login=await fetch(site+"/auth/sign-in/email",{
  method:"POST",headers:{"content-type":"application/json",origin:site,accept:"application/json"},
  body:JSON.stringify({email,password}),signal:AbortSignal.timeout(20000),redirect:"manual"
 });
 if(!login.ok)throw Error(label+" sign-in failed with HTTP "+login.status+"; check staging account verification and Actions secrets.");
 const cookie=(login.headers.getSetCookie?.()||[]).map(value=>value.split(";")[0]).filter(Boolean).join("; ");
 if(!cookie)throw Error(label+" sign-in returned no Neon session cookie.");
 const session=await fetch(site+"/auth/get-session",{headers:{cookie,accept:"application/json"},signal:AbortSignal.timeout(20000)});
 const sessionData=await session.json().catch(()=>null);
 if(!session.ok||!sessionData?.user)throw Error(label+" session could not be restored.");
 if(sessionData.user.emailVerified!==true)throw Error(label+" staging email is not verified.");
 const tokenResponse=await fetch(site+"/auth/token",{headers:{cookie,accept:"application/json"},signal:AbortSignal.timeout(20000)});
 const tokenData=await tokenResponse.json().catch(()=>null);
 const jwt=tokenData?.token??tokenData?.data?.token;
 if(!tokenResponse.ok||typeof jwt!=="string"||jwt.split(".").length!==3)
  throw Error(label+" signed JWT could not be obtained; check the Neon Auth proxy.");
 return jwt;
}

 fix/kota-real-role-e2e-20261119

const candidateHealth = expect(await call("/api/health"),200,"candidate health");
assertCandidateHealth(fixtureConfig, candidateHealth);
 feature/neon-only-cutover
[env.owner,env.admin]=await Promise.all([
 signedJwt(required.ownerEmail,required.ownerPassword,"Owner"),
 signedJwt(required.adminEmail,required.adminPassword,"Administrator")
]);
const ownerIdentity=expect(await call("/api/me","owner"),200,"verified owner identity");
const adminIdentity=expect(await call("/api/me","admin"),200,"verified admin identity");
if(ownerIdentity.admin!==false||adminIdentity.admin!==true||ownerIdentity.subject===adminIdentity.subject)
 throw Error("Staging account role isolation failed: use separate owner and admin accounts.");
 fix/kota-real-role-e2e-20261119

assertFixturePrincipals(fixtureConfig, ownerIdentity, adminIdentity);
 feature/neon-only-cutover
const access=expect(await call("/api/owner/access","owner"),200,"approved owner access");
if(access.approved!==true)throw Error("Staging shop owner has not been approved by the administrator.");
expect(await call("/api/owner/orders","admin"),403,"administrator denied owner orders");
expect(await call("/api/admin/orders","owner"),403,"shop owner denied admin orders");
expect(await call("/api/admin/shop-applications","owner"),403,"shop owner denied admin applications");
const applications=expect(await call("/api/admin/shop-applications","admin"),200,"admin application oversight");
if(!Array.isArray(applications.applications))throw Error("Admin cannot list shop applications.");
const shops=expect(await call("/api/owner/shops","owner"),200,"owner shops");
if(!Array.isArray(shops.shops))throw Error("Owner dashboard shop listing is invalid.");
 fix/kota-real-role-e2e-20261119
for(const shop of shops.shops.filter(value=>value.approved===true)){
 const data=expect(await call("/api/owner/shops/"+encodeURIComponent(shop.id)+"/menu","owner"),200,"owner menu");
 const available=(data.items||[]).find(item=>item.available===true&&item.id);
 if(available){env.shop=shop.id;env.menu=available.id;break;}
}
if(!env.shop||!env.menu)throw Error("Verified staging owner needs one approved shop with an available priced menu item.");

const fixtureShop = selectFixtureShop(fixtureConfig, shops.shops);
const fixtureMenu = expect(await call("/api/owner/shops/"+encodeURIComponent(fixtureShop.id)+"/menu","owner"),200,"fixture owner menu");
const fixtureItem = selectFixtureMenuItem(fixtureConfig, fixtureMenu.items);
env.shop=fixtureShop.id;env.menu=fixtureItem.id;
 feature/neon-only-cutover
console.log("PASS: real signed owner/admin sessions, distinct roles, approved shop and live menu; proceeding with test-flagged orders.");
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
expect(await call("/api/orders/"+orderId,"otherCustomer"),403,"other customer tracking");
expect(await call("/api/owner/orders/"+orderId+"/status","customer","PATCH",{status:"accepted",note:"guest must not update status"}),401,"customer status update");
expect(await call("/api/owner/orders/"+orderId+"/status","admin","PATCH",{status:"accepted",note:"admin must not update owner status"}),403,"admin denied owner status update");
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
expect(await call("/api/admin/commission","owner"),403,"owner denied administrator commission");
expect(await call("/api/admin/commission",null),401,"anonymous denied administrator commission");
const commission=expect(await call("/api/admin/commission","admin"),200,"administrator commission estimates");
if(commission.commissionPaused!==true||commission.rateCents!==50||commission.thresholdCents!==2000||commission.collectedCommissionCents!==null)
 throw Error("Commission must remain paused, role-scoped and uncollected, at R0.50 per completed non-test order.");
if(commission.estimatedCommissionCents!==commission.eligibleCompletedOrders*50||commission.remainingToThresholdCents!==Math.max(0,2000-commission.estimatedCommissionCents))
 throw Error("Commission forecast or R20 threshold calculation is inconsistent.");
if(!Array.isArray(commission.shops))throw Error("Commission per-shop ledger is missing.");
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
 fix/kota-real-role-e2e-20261119
console.log("PASS: REAL_DEV_INTEGRATION signed owner/admin authentication, guest ordering, idempotency, strict role isolation, order statuses, customer tracking, notifications, admin oversight, rejection flow and paused commission");

console.log("PASS: REAL_DEV_INTEGRATION signed owner/admin authentication, guest ordering, idempotency, strict role isolation, order statuses, customer tracking, notifications, admin oversight, secure commission estimates, rejection flow and paused collection");
 feature/neon-only-cutover
