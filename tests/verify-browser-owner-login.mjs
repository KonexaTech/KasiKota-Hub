// Real headless-browser acceptance: owner signup, sign-out, sign-in and /api/me.
// Staging-only disposable account; never print credentials, cookies, JWT or user IDs.
import { chromium } from "playwright";
import {randomBytes} from "node:crypto";
const base="https://kota-connect-neon-staging.pages.dev/neon-owner.html";
const email="kota-browser-ci-"+randomBytes(8).toString("hex")+"@example.com";
const password=randomBytes(32).toString("base64url")+"Aa9!";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const authTraffic=[];
const errors=[];
let page;
async function activity(){
 await page.waitForFunction(()=>{
  const text=document.querySelector("#result")?.textContent||"";
  return text!=="Ready" && text!=="Ready." && !!text.trim();
 },null,{timeout:30000});
 return (await page.locator("#result").textContent())||"";
}
try{
 page=await browser.newPage({ignoreHTTPSErrors:false});
 page.on("response",response=>{
  try{
   const url=new URL(response.url());
   if(url.host==="kota-connect-neon-staging.pages.dev" &&
       (url.pathname.startsWith("/auth/")||url.pathname==="/api/me"))
     authTraffic.push({path:url.pathname,status:response.status()});
  }catch{}
 });
 page.on("pageerror",e=>{errors.push(String(e.message||e).slice(0,180))});
 await page.goto(base,{waitUntil:"domcontentloaded",timeout:30000});
 await page.locator("#email").fill(email);
 await page.locator("#password").fill(password);
 await page.locator("#signup").click();
 const signupActivity=await activity();
 console.log(JSON.stringify({stage:"browser_signup",success:signupActivity.includes("Account created"),error:signupActivity.startsWith("Error:")?signupActivity.slice(0,240):null}));
 if(signupActivity.startsWith("Error:"))throw Error("Browser signup: "+signupActivity.slice(0,200));
 await page.locator("#signout").click();
 await page.waitForFunction(()=>document.querySelector("#identity")?.textContent?.includes("Not signed in"),null,{timeout:30000});
 await page.locator("#signin button").click();
 await page.waitForFunction(()=>{
   const identity=document.querySelector("#identity")?.textContent||"";
   const result=document.querySelector("#result")?.textContent||"";
   return identity.includes("@")||result.startsWith("Error:");
 },null,{timeout:30000});
 const finalActivity=(await page.locator("#result").textContent())||"";
 const identity=(await page.locator("#identity").textContent())||"";
 const allowed=await page.locator('[data-restricted-panel]').first().evaluate(el=>!el.hidden);
 console.log(JSON.stringify({stage:"browser_owner_login",hasIdentity:identity.includes("@"),allowed,activityError:finalActivity.startsWith("Error:")?finalActivity.slice(0,240):null,traffic:authTraffic.slice(-20),pageErrors:errors.slice(-5)}));
 if(!identity.includes("@")||!allowed)throw Error("Browser owner sign-in or role enforcement failed");
 console.log("PASS: browser signup -> signout -> signin -> JWT -> owner dashboard");
}finally{await browser.close()}
