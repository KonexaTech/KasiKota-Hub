// Real headless-browser checks for the deployed staging access boundaries.
import { chromium } from "playwright";
const base="https://kota-connect-neon-staging.pages.dev";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const errors=[];
try{
 const page=await browser.newPage();
 page.on("pageerror",e=>errors.push(String(e.message||e).slice(0,160)));
 await page.goto(base+"/neon-customer.html",{waitUntil:"domcontentloaded",timeout:30000});
 if(await page.locator("#openShopRegistration").count()!==1)throw Error("Customer page is missing the Register your shop button");
 if(await page.locator("#registerShop").count()!==1)throw Error("Customer page is missing the shop registration modal");
 for(const [role,path,route] of [
  ["owner","/neon-owner.html","/api/owner/orders"],
  ["admin","/neon-admin.html","/api/admin/orders"]
 ]){
  await page.goto(base+path,{waitUntil:"domcontentloaded",timeout:30000});
  if(await page.locator("#signin").count()!==1)throw Error(role+" sign-in form is missing");
  if(await page.locator("#signup").count()!==0)throw Error(role+" dashboard still offers self-registration");
  const visible=await page.locator("[data-restricted-panel]").evaluateAll(els=>els.some(el=>!el.hidden));
  if(visible)throw Error(role+" restricted dashboard panels are visible without authentication");
  const response=await page.evaluate(async route=>fetch(route,{cache:"no-store"}).then(r=>({status:r.status})),route);
  if(response.status!==401)throw Error(role+" API route should reject anonymous access, got "+response.status);
  const guestResponse=await page.evaluate(async route=>{
   const bytes=crypto.getRandomValues(new Uint8Array(32));
   const token=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
   return fetch(route,{headers:{authorization:"Guest "+token},cache:"no-store"}).then(r=>({status:r.status}));
  },route);
  if(guestResponse.status!==401)throw Error(role+" API route should reject guest tokens, got "+guestResponse.status);
 }
 if(errors.length)throw Error("Browser page errors: "+errors.join("; "));
 console.log("PASS: customer registration modal, login-only owner/admin pages and anonymous/guest API denial");
}finally{await browser.close()}
