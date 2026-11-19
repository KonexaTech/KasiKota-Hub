// Real browser acceptance for an existing, approved staging owner.
// Credentials are optional GitHub Actions secrets and are never logged.
const email=(process.env.KOTA_TEST_OWNER_EMAIL||"").trim();
const password=process.env.KOTA_TEST_OWNER_PASSWORD||"";
if(!email||!password){
  console.log("SKIP: KOTA_TEST_OWNER_EMAIL and KOTA_TEST_OWNER_PASSWORD are not configured.");
  process.exit(0);
}
const {chromium}=await import("playwright");
const base="https://kota-connect-neon-staging.pages.dev/neon-owner.html";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const authTraffic=[];
const errors=[];
try{
  const page=await browser.newPage({ignoreHTTPSErrors:false});
  page.on("response",response=>{
    try{
      const url=new URL(response.url());
      if(url.host==="kota-connect-neon-staging.pages.dev"&&
        (url.pathname.startsWith("/auth/")||url.pathname==="/api/me"||url.pathname==="/api/owner/access"))
        authTraffic.push({path:url.pathname,status:response.status()});
    }catch{}
  });
  page.on("pageerror",error=>errors.push(String(error.message||error).slice(0,180)));
  await page.goto(base,{waitUntil:"domcontentloaded",timeout:30000});
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#signin button").click();
  await page.waitForFunction(()=>{
    const result=document.querySelector("#result")?.textContent||"";
    return result==="Signed in. Your shop is approved."||result.startsWith("Error:");
  },null,{timeout:30000});
  const activity=(await page.locator("#result").textContent())||"";
  const identity=(await page.locator("#identity").textContent())||"";
  const allowed=await page.locator("[data-restricted-panel]").first().evaluate(element=>!element.hidden);
  const hasToken=authTraffic.some(event=>event.path==="/auth/token"&&event.status===200);
  const hasMe=authTraffic.some(event=>event.path==="/api/me"&&event.status===200);
  const hasOwnerAccess=authTraffic.some(event=>event.path==="/api/owner/access"&&event.status===200);
  console.log(JSON.stringify({stage:"approved_owner_browser_login",signedIn:identity.toLowerCase()===email.toLowerCase(),allowed,hasToken,hasMe,hasOwnerAccess,activityError:activity.startsWith("Error:")?activity.slice(0,240):null,pageErrors:errors.slice(-5)}));
  if(identity.toLowerCase()!==email.toLowerCase()||!allowed||!hasToken||!hasMe||!hasOwnerAccess||activity.startsWith("Error:")||errors.length)
    throw Error("Approved owner browser login or server role verification failed");
  console.log("PASS: approved owner sign-in -> signed JWT -> /api/me -> /api/owner/access -> owner dashboard");
}finally{
  await browser.close();
}
