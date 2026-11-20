// Browser-level button audit using only local pages and mocked auth/API responses.
// Does not connect to Neon data or make real customer/admin/owner mutations.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const root=resolve("staging-preview");
const uuids={
 shop:"11111111-1111-4111-8111-111111111111",
 item:"22222222-2222-4222-8222-222222222222",
 order:"33333333-3333-4333-8333-333333333333",
 notif:"44444444-4444-4444-8444-444444444444",
 appApprove:"55555555-5555-4555-8555-555555555555",
 appReject:"66666666-6666-4666-8666-666666666666"
};
const shop={id:uuids.shop,name:"Kota Audit Test Shop",area:"Newcastle CBD",address:"Mock Street",phone:"0700000000",approved:true};
let menu=[{id:uuids.item,name:"Classic Kota",price_cents:2500,available:true}];
let order={id:uuids.order,order_number:"TEST-LOCAL-001",status:"pending",fulfillment_type:"pickup",customer_name:"Mock Customer",total_cents:2500,owner_note:null};
let applications=[
 {id:uuids.appApprove,status:"pending",shop_name:"Approved Mock Shop",area:"Newcastle CBD",owner_name:"Owner A"},
 {id:uuids.appReject,status:"pending",shop_name:"Rejected Mock Shop",area:"Newcastle CBD",owner_name:"Owner B"}
];
let notifications=[{id:uuids.notif,kind:"new_order",title:"New test order",body:"Mock only",read_at:null}];
const calls=[];
const authModule=[
  'export function createAuthClient(){',
  ' const state=globalThis.__kotaMockAuth||(globalThis.__kotaMockAuth={signedIn:document.body.dataset.role!=="customer",email:"audit@example.test",events:[]});',
  ' const ok={data:{success:true},error:null};',
  ' return {',
  '  getSession:async()=>({data:{user:state.signedIn?{email:state.email,emailVerified:true}:null},error:null}),',
  '  signIn:{email:async()=>{state.events.push("signIn");state.signedIn=true;return {data:{user:{email:state.email,emailVerified:true}},error:null}}},',
  '  signUp:{email:async()=>{state.events.push("signUp");return ok}},',
  '  signOut:async()=>{state.events.push("signOut");state.signedIn=false;return ok},',
  '  forgetPassword:{emailOtp:async()=>{state.events.push("forgotPassword");return ok}},',
  '  emailOtp:{',
  '    sendVerificationOtp:async()=>{state.events.push("sendVerification");return ok},',
  '    verifyEmail:async()=>{state.events.push("verifyEmail");return ok},',
  '    resetPassword:async()=>{state.events.push("completePasswordReset");return ok}',
  '  }',
  ' };',
  '}'
].join("\n");

const server=http.createServer(async(req,res)=>{
 try{
   const raw=new URL(req.url,"http://127.0.0.1").pathname;
   const path=resolve(root,"."+decodeURIComponent(raw==="/"?"/neon-customer.html":raw));
   if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
   const bytes=await readFile(path);
   const mime={".html":"text/html",".mjs":"application/javascript",".js":"application/javascript",".css":"text/css"}[extname(path)]||"text/plain";
   res.writeHead(200,{"content-type":mime+"; charset=utf-8","cache-control":"no-store"});
   res.end(bytes);
 }catch{res.writeHead(404);res.end("Not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port;
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const browserErrors=[];
const results=[];

function apiResponse(path,method,body){
 if(path==="/api/me")return {admin:globalThis.__currentRole==="admin"};
 if(path==="/api/owner/access")return {approved:true};
 if(path==="/api/shops")return {shops:[shop]};
 if(path==="/api/shops/"+uuids.shop+"/menu")return {items:menu.filter(x=>x.available)};
 if(path==="/api/owner/shops"&&method==="GET")return {shops:[shop]};
 if(path==="/api/owner/shops/"+uuids.shop&&method==="PATCH"){Object.assign(shop,body);return {shop};}
 if(path==="/api/owner/shops/"+uuids.shop+"/menu"&&method==="GET")return {items:menu};
 if(path==="/api/owner/shops/"+uuids.shop+"/menu"&&method==="POST"){
  const added={id:uuids.item,...body,price_cents:body.priceCents,available:true};
  menu.push(added);return {item:added};
 }
 if(path==="/api/owner/shops/"+uuids.shop+"/menu/"+uuids.item&&method==="PATCH"){
  const current=menu.find(x=>x.id===uuids.item);Object.assign(current,{name:body.name,price_cents:body.priceCents,available:body.available});return {item:current};
 }
 if(path==="/api/owner/orders")return {orders:[order]};
 if(path==="/api/owner/orders/"+uuids.order+"/status"&&method==="PATCH"){order.status=body.status;order.owner_note=body.note||null;return {ok:true};}
 if(path==="/api/orders/"+uuids.order)return {order};
 if(path==="/api/orders/"+uuids.order+"/items")return {items:[{name:"Classic Kota",quantity:1,price_cents:menu[0].price_cents}]};
 if(path==="/api/orders/"+uuids.order+"/history")return {events:[{status:order.status}]};
 if(path==="/api/orders"&&method==="POST"){
  order={...order,status:"pending",fulfillment_type:body.fulfillmentType,customer_name:body.customerName,total_cents:menu[0].price_cents*body.items[0].quantity+(body.fulfillmentType==="delivery"?500:0)};
  return {order};
 }
 if(path==="/api/admin/overview")return {shopCount:1,approvedShopCount:1,applications:[{status:"pending",count:applications.filter(x=>x.status==="pending").length}],shops:[shop],commissionPaused:true,estimatedCommissionCents:0,collectedCommissionCents:null,commissionCollectionStatus:"Commission paused"};
 if(path==="/api/admin/shop-applications"&&method==="GET")return {applications};
 if(path.startsWith("/api/admin/shop-applications/")&&path.endsWith("/review")&&method==="PATCH"){
  const id=path.split("/")[4];const app=applications.find(x=>x.id===id);
  assert.ok(app,"Mock application must exist");app.status=body.status;return {ok:true};
 }
 if(path==="/api/admin/orders")return {orders:[order]};
 if(path==="/api/admin/commission")return {commissionPaused:true,rateCents:50,thresholdCents:2000,eligibleCompletedOrders:1,excludedTestOrders:2,estimatedCommissionCents:50,remainingToThresholdCents:1950,collectedCommissionCents:null,shops:[{shopId:uuids.shop,shopName:"Kota Audit Test Shop",eligibleOrders:1,estimatedCommissionCents:50}]};
 if(path==="/api/notifications")return {notifications};
 if(path==="/api/notifications/"+uuids.notif+"/read"&&method==="PATCH"){notifications[0].read_at="2026-11-19T00:00:00Z";return {ok:true};}
 if(path==="/api/shop-applications"&&method==="POST")return {application:{id:uuids.appApprove,status:"pending"}};
 throw Error("Dashboard called an unmocked route: "+method+" "+path);
}

async function makePage(role){
 globalThis.__currentRole=role;
 const page=await browser.newPage({viewport:{width:420,height:850}});
 page.on("pageerror",error=>browserErrors.push(role+": "+error.message));
 await page.addInitScript(()=>{window.confirm=()=>true;});
 await page.route("https://esm.sh/**",async route=>route.fulfill({status:200,contentType:"application/javascript",headers:{"access-control-allow-origin":"*"},body:authModule}));
 await page.route("**/auth/token",async route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({token:"abc.def.ghi"})}));
 await page.route("**/api/**",async route=>{
  const request=route.request(),url=new URL(request.url()),method=request.method();
  const body=request.postDataJSON?.()||{};
  calls.push(role+" "+method+" "+url.pathname);
  try{const data=apiResponse(url.pathname,method,body);await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});}
  catch(error){browserErrors.push(String(error.message));await route.fulfill({status:500,contentType:"application/json",body:JSON.stringify({error:error.message})});}
 });
 await page.goto(base+"/"+(role==="customer"?"neon-customer.html":"neon-"+role+".html"),{waitUntil:"networkidle",timeout:30000});
 return page;
}
async function resultContains(page,snippet){
 try{await page.waitForFunction(s=>document.getElementById("result")?.textContent?.includes(s),snippet,{timeout:7000});}
 catch(error){const actual=await page.locator("#result").textContent().catch(()=>"(no result element)");throw Error("Expected dashboard activity to include "+JSON.stringify(snippet)+", got "+JSON.stringify(actual)+": "+error.message);}
}
async function authActions(page,role){
 // Mock starts with a session, so sign out before exercising email verification.
 await page.locator("#signout").click();
 await resultContains(page,"Signed out");
 assert.equal(await page.locator("#togglePasswordReset").isVisible(),false,"Reset password must be post-login only");
 await page.locator("#email").fill("audit@example.test");
 await page.locator("#verificationHelp summary").click();
 await page.locator("#sendVerification").click();
 await resultContains(page,"Verification code requested");
 await page.locator("#emailVerificationCode").fill("123456");
 await page.locator("#verifyEmail").click();
 await resultContains(page,"Email verified");
 await page.locator("#password").fill("MockPassword123!");
 await page.locator("#signin button").click();
 await resultContains(page,role==="admin"?"Administrator access verified":"Your shop is approved");
 assert.equal(await page.locator("#togglePasswordReset").isVisible(),true);
 assert.equal(await page.locator("#passwordResetFields").isVisible(),false);
 await page.locator("#togglePasswordReset").click();
 assert.equal(await page.locator("#passwordResetFields").isVisible(),true);
 await page.locator("#forgotPassword").click();
 await resultContains(page,"password reset code has been sent");
 await page.locator("#verificationCode").fill("654321");
 await page.locator("#newPassword").fill("AnotherMockPassword123!");
 await page.locator("#completePasswordReset").click();
 await resultContains(page,"Password changed successfully");
 await page.locator("#signin button").click();
 await resultContains(page,role==="admin"?"Administrator access verified":"Your shop is approved");
 await page.locator("#signout").click();
 await resultContains(page,"Signed out");
 const events=await page.evaluate(()=>globalThis.__kotaMockAuth.events);
 for(const event of ["signIn","sendVerification","verifyEmail","forgotPassword","completePasswordReset","signOut"])assert.ok(events.includes(event),role+" missing auth action "+event);
 results.push(role+": all account and password recovery button clicks passed (mocked auth)");
}

try{
 const owner=await makePage("owner");
 await owner.locator("[data-restricted-panel]").first().waitFor({state:"visible"});
 assert.equal(await owner.locator("#openNotifications").isVisible(),true);
 await owner.locator("#openNotifications").click();
 assert.equal(await owner.locator("#notificationsPanel").isVisible(),true);
 assert.match(await owner.locator("#openNotifications").innerText(),/Notifications/);
 await owner.locator("#closeNotifications").click();
 assert.equal(await owner.locator("#notificationsPanel").isVisible(),false);
 assert.equal(await owner.locator("#manageShopDialog").isVisible(),false);
 await owner.locator("#manageShopButton").click();
 assert.equal(await owner.locator("#manageShopDialog").isVisible(),true);
 await resultContains(owner,"shops found");
 await owner.locator("#shop").selectOption(uuids.shop);
 await owner.locator("#saveShopDetails").click();
 await resultContains(owner,"Shop details saved");
 await owner.locator("#myMenu").click();
 await resultContains(owner,"Loaded 1 available");
 await owner.locator("#menuText").fill("Classic Kota — R26");
 await owner.locator("#saveMenu").click();
 await resultContains(owner,"Menu saved");
 assert.equal(menu[0].price_cents,2600);
 await owner.locator("#closeManageShop").click();
 assert.equal(await owner.locator("#manageShopDialog").isVisible(),false);
 await owner.locator("#openCustomerOrders").click();
 assert.equal(await owner.locator("#customerOrdersDialog").isVisible(),true);
 await owner.locator("#myOrders").click();
 await resultContains(owner,"orders");
 await owner.locator("#orderItems").click();
 await resultContains(owner,"Classic Kota");
 await owner.locator("#updateStatus").click();
 await resultContains(owner,"Status saved");
 assert.equal(order.status,"accepted");
 await owner.locator("#closeCustomerOrders").click();
 assert.equal(await owner.locator("#customerOrdersDialog").isVisible(),false);
 await owner.locator("#openDashboardNotifications").click();
 assert.equal(await owner.locator("#notificationsPanel").isVisible(),true);
 await owner.locator("#notifications").click();
 assert.match(await owner.locator("#notificationList").innerText(),/New test order/);
 assert.match(await owner.locator("#notificationList").innerText(),/Mock only/);
 await owner.locator("#notificationList button").click();
 await resultContains(owner,"Notification marked as read");
 assert.match(await owner.locator("#notificationList").innerText(),/Read/);
 await owner.locator("#closeNotifications").click();
 results.push("owner: shop management, customer orders dialog, statuses and Neon notifications passed (mocked API)");
 await authActions(owner,"owner");
 await owner.close();

 const admin=await makePage("admin");
 await admin.locator("[data-restricted-panel]").first().waitFor({state:"visible"});
 assert.equal(await admin.locator("#openNotifications").isVisible(),true);
 await admin.locator("#openNotifications").click();
 assert.equal(await admin.locator("#notificationsPanel").isVisible(),true);
 assert.match(await admin.locator("#openNotifications").innerText(),/Notifications/);
 await admin.locator("#closeNotifications").click();
 await admin.locator("#adminOverview").click();
 await resultContains(admin,"Administrator dashboard loaded");
 await admin.locator("#applications").click();
 await resultContains(admin,"2 pending");
 await admin.locator("#applicationPicker").selectOption(uuids.appApprove);
 await admin.locator("#approve").click();
 await resultContains(admin,"Shop approved");
 await admin.locator("#applicationPicker").selectOption(uuids.appReject);
 await admin.locator("#reject").click();
 await resultContains(admin,"Shop application rejected");
 assert.equal(applications.filter(x=>x.status==="pending").length,0);
 await admin.locator("#openCustomerOrders").click();
 assert.equal(await admin.locator("#customerOrdersDialog").isVisible(),true);
 await admin.locator("#orders").click();
 await resultContains(admin,"TEST-LOCAL-001");
 assert.match(await admin.locator("#adminOrderList").innerText(),/TEST-LOCAL-001/);
 assert.match(await admin.locator("#adminOrderList").innerText(),/R25.00/);
 await admin.locator("#adminOrderList .admin-order-card button").click();
 await admin.locator("#adminOrderList .admin-order-items").waitFor({state:"visible"});
 assert.match(await admin.locator("#adminOrderList").innerText(),/Classic Kota/);
 await admin.locator("#closeCustomerOrders").click();
 await admin.locator("#openDashboardNotifications").click();
 assert.equal(await admin.locator("#notificationsPanel").isVisible(),true);
 await admin.locator("#notifications").click();
 assert.match(await admin.locator("#notificationList").innerText(),/New test order/);
 assert.match(await admin.locator("#notificationList").innerText(),/Read/);
 await admin.locator("#notificationId").fill(uuids.notif);
 await admin.locator("#markRead").click();
 await resultContains(admin,"Notification marked as read");
 await admin.locator("#closeNotifications").click();
 await admin.locator("#openCommission").click();
 assert.equal(await admin.locator("#commissionDialog").isVisible(),true);
 await admin.waitForFunction(()=>document.getElementById("commissionEstimate")?.textContent==="R0.50");
 assert.match(await admin.locator("#commissionShopList").innerText(),/Kota Audit Test Shop/);
 assert.match(await admin.locator("#commissionStatus").innerText(),/Collection paused/);
 await admin.locator("#refreshCommission").click();
 await resultContains(admin,"Commission estimates refreshed");
 await admin.locator("#closeCommission").click();
 results.push("admin: application approvals, customer orders dialog, notifications and R0.50 Neon commission ledger passed (mocked API)");
 await authActions(admin,"admin");
 await admin.close();

 const customer=await makePage("customer");
 await customer.locator("#proceed").click();
 await customer.locator("#loadShops").click();
 await customer.waitForFunction(()=>document.getElementById("shopCount")?.textContent?.includes("1 approved"));
 await customer.locator("#area").selectOption("newcastle-cbd");
 await customer.locator("#shopSearch").fill("Kota Audit");
 await customer.locator("#shopResults button").click();
 await customer.locator("#menuItems button").click();
 await customer.locator("#quantity").fill("1");
 await customer.locator("#fulfillment").selectOption("delivery");
 assert.equal(await customer.locator("#deliveryAddressPanel").isVisible(),true);
 assert.ok((await customer.locator("#orderTotal").textContent()).includes("R31.00"));
 await customer.locator("#customerName").fill("Mock Customer");
 await customer.locator("#customerPhone").fill("0700000000");
 await customer.locator("#address").fill("Mock Street");
 await customer.locator("#confirmOrder").click();
 await customer.waitForFunction(()=>document.getElementById("successMessage")?.textContent?.includes("TEST-LOCAL-001"));
 await customer.locator("#track").click();
 await customer.waitForFunction(()=>document.getElementById("trackingStatus")?.textContent?.includes("TEST-LOCAL-001"));
 await customer.locator("#openShopRegistration").click();
 assert.equal(await customer.locator("#registerShop").isVisible(),true);
 await customer.locator("#closeRegistration").click();
 assert.equal(await customer.locator("#registerShop").isVisible(),false);
 await customer.locator("#openShopRegistration").click();
 for(const [id,value] of Object.entries({
  regOwnerName:"Mock Owner",regShopName:"Mock Shop Registration",regEmail:"new-audit@example.test",
  regPhone:"0700000000",regAddress:"Mock Street",regPassword:"FakePassword123!",
  regPasswordConfirm:"FakePassword123!"
 }))await customer.locator("#"+id).fill(value);
 await customer.locator("#regArea").selectOption({label:"Newcastle CBD"});
 await customer.locator('#shopRegistrationForm button[type="submit"]').click();
 await customer.waitForFunction(()=>document.getElementById("registrationStatus")?.textContent?.includes("confirmation code has been sent"));
 await customer.locator("#regOtp").fill("123456");
 await customer.locator("#confirmRegistration").click();
 await customer.waitForFunction(()=>document.getElementById("registrationStatus")?.textContent?.includes("application submitted successfully"));
 const events=await customer.evaluate(()=>globalThis.__kotaMockAuth.events);
 assert.ok(events.includes("signUp")&&events.includes("sendVerification")&&events.includes("verifyEmail"));
 results.push("customer: navigation, shop discovery, menu/price, delivery quote, checkout, tracking and registration passed (mocked API)");
 await customer.close();

 assert.equal(browserErrors.length,0,"Unexpected browser/API failures: "+browserErrors.join("; "));
 assert.ok(calls.some(x=>x.includes("PATCH /api/owner/orders/")),"Owner status update request not observed");
 assert.ok(calls.some(x=>x.includes("PATCH /api/admin/shop-applications/")),"Admin review request not observed");
 assert.ok(calls.some(x=>x.includes("POST /api/orders")),"Guest checkout request not observed");
 console.log(JSON.stringify({result:"PASS",type:"LOCAL_MOCK_ONLY",results,apiCalls:calls.length}));
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
