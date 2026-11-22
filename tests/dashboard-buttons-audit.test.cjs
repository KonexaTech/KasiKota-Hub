const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const source=path=>fs.readFileSync("staging-preview/"+path,"utf8");
const owner=source("neon-owner.html");
const admin=source("neon-admin.html");
const customer=source("neon-customer.html");
const dashboards=source("neon-app.js");
const orderClient=source("kota-customer.mjs");
const registration=source("kota-shop-registration.mjs");

function buttonIds(html){return [...html.matchAll(/<button\b[^>]*\bid="([^"]+)"/g)].map(match=>match[1]);}
function bound(client,id){const target='$("' +id+ '")';return client.includes('bind("'+id+'"')||client.includes(target+'.onclick=')||client.includes(target+'.addEventListener("click"')||client.includes(target+'?.addEventListener("click"')||(id==="openNotifications"&&client.includes('const shortcut=$("openNotifications")')&&client.includes('shortcut.addEventListener("click"'));}

test("every named owner dashboard button is attached to an action",()=>{
 const ids=buttonIds(owner);
 assert.equal(new Set(ids).size,ids.length,"Owner button IDs must be unique");
 for(const id of ids)assert.ok(bound(dashboards,id),"Owner button has no handler: "+id);
 assert.match(owner,/<form id="signin">/);
 assert.ok(dashboards.includes('$("signin").addEventListener("submit"'),"Sign-in form not wired");
 assert.equal(buttonIds(owner).includes("signup"),false);
});

test("every named administrator dashboard button is attached to an action",()=>{
 const ids=buttonIds(admin);
 assert.equal(new Set(ids).size,ids.length,"Admin button IDs must be unique");
 for(const id of ids)assert.ok(bound(dashboards,id),"Admin button has no handler: "+id);
 assert.match(admin,/<form id="signin">/);
 assert.ok(dashboards.includes('$("signin").addEventListener("submit"'));
 assert.equal(ids.includes("signup"),false);
});

test("every customer action is attached to a real page event",()=>{
 const mappings={
   proceed:orderClient,loadShops:orderClient,track:orderClient,
   openShopRegistration:registration,closeRegistration:registration,
   confirmRegistration:registration
 };
 for(const [id,client] of Object.entries(mappings)){
   assert.ok(customer.includes('id="'+id+'"'),"Customer control missing: "+id);
   assert.ok(client.includes('$("'+id+'").addEventListener("click"')||client.includes('action("'+id+'"'),"Customer control has no handler: "+id);
 }
 assert.match(customer,/<form id="checkout">/);
 assert.ok(orderClient.includes('$("checkout").addEventListener("submit"'),"Checkout submit action missing");
 assert.match(customer,/<form id="shopRegistrationForm">/);
 assert.ok(registration.includes('$("shopRegistrationForm").addEventListener("submit"'),"Shop registration submit missing");
 assert.ok(orderClient.includes('open.addEventListener("click"'),"Dynamic View menu button has no click handler");
 assert.ok(orderClient.includes('button.addEventListener("click",()=>chooseItem(item))'),"Menu price buttons have no click handlers");
 for(const id of ["area","shopSearch","fulfillment","quantity"])assert.ok(orderClient.includes('$("'+id+'").addEventListener('),"Customer filter/quote control has no handler: "+id);
});

test("password reset uses documented Neon Auth OTP request and completion",()=>{
 for(const html of [owner,admin]){
   assert.ok(html.includes('id="forgotPassword"'));
   assert.ok(html.includes('id="completePasswordReset"'));
   assert.ok(html.includes('id="newPassword"'));
   assert.ok(html.includes('id="verificationCode"'));
 }
 assert.ok(dashboards.includes('auth.forgetPassword.emailOtp({email})'));
 assert.ok(dashboards.includes('auth.emailOtp.resetPassword({email,otp,password})'));
 assert.ok(dashboards.includes('if(password.length<12)'));
 assert.ok(dashboards.includes('await auth.signOut()'));
});

test("notification Mark read validates a nonempty UUID",()=>{
 assert.ok(dashboards.includes('required("notificationId","Notification ID")'));
 assert.ok(dashboards.includes('if(!orderIdPattern.test(id))'));
 assert.ok(dashboards.includes('await pollNotifications(true)'));
});

test("dashboard actions route to authenticated APIs; roles are separate",()=>{
 for(const route of [
  '/api/me','/api/owner/access','/api/owner/shops','/api/owner/orders',
  '/api/admin/overview','/api/admin/shop-applications','/api/admin/orders',
  '/api/notifications'
 ])assert.ok(dashboards.includes(route),"Action route missing: "+route);
 assert.ok(dashboards.includes('ownerAccess?.approved===true'));
 assert.ok(dashboards.includes('me.admin===true'));
 assert.ok(dashboards.includes('me.admin===false'));
 assert.ok(dashboards.includes('headers.authorization="Bearer "+await apiJwt()'));
});