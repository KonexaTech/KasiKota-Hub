// Browser acceptance for customer registration and role-protected dashboards.
import { chromium } from "playwright";
const base="https://kota-connect-neon-staging.pages.dev";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const errors=[];
try{
 const page=await browser.newPage();
 page.on("pageerror",e=>errors.push(String(e.message||e).slice(0,160)));
 await page.goto(base+"/neon-customer",{waitUntil:"domcontentloaded",timeout:30000});
 if(await page.locator("#openShopRegistration").count()!==1)throw Error("Customer page is missing the Register your shop button");
 if(await page.locator("#registerShop").count()!==1)throw Error("Customer page is missing the shop registration modal");
 if(await page.locator("#signin").count()!==0)throw Error("Customer checkout must not require a customer account");
 for(const [role,path,route] of [
  ["owner","/neon-owner","/api/owner/orders"],
  ["admin","/neon-admin","/api/admin/orders"]
 ]){
  await page.goto(base+path,{waitUntil:"domcontentloaded",timeout:30000});
  if(await page.locator("#signin").count()!==1)throw Error(role+" sign-in form is missing");
  if(await page.locator("#signup").count()!==0)throw Error(role+" dashboard still offers self-registration");
  if(await page.locator("#sendVerification").count()!==1||await page.locator("#verifyEmail").count()!==1)throw Error(role+" email verification controls are missing");
  if(await page.locator("#verificationCode").count()!==1)throw Error(role+" verification code input is missing");
  const visible=await page.locator("[data-restricted-panel]").evaluateAll(els=>els.some(el=>!el.hidden));
  if(visible)throw Error(role+" restricted dashboard panels are visible without authentication");
  const anonymous=await page.evaluate(async route=>fetch(route,{cache:"no-store"}).then(r=>({status:r.status})),route);
  if(anonymous.status!==401)throw Error(role+" API route should reject anonymous access, got "+anonymous.status);
  const guest=await page.evaluate(async route=>{
   const bytes=crypto.getRandomValues(new Uint8Array(32));
   const token=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
   return fetch(route,{headers:{authorization:"Guest "+token},cache:"no-store"}).then(r=>({status:r.status}));
  },route);
  if(guest.status!==401)throw Error(role+" API route should reject guest tokens, got "+guest.status);
 }
 if(errors.length)throw Error("Browser page errors: "+errors.join("; "));
 console.log("PASS: customer registration modal, no customer login, owner/admin verification controls and anonymous/guest API denial");
}finally{await browser.close()}
