// Probe deployed staging routes and verify the actual cache-busted client.
const base="https://kota-connect-neon-staging.pages.dev";
const version="20261119-notifications-v1";
const paths=["/auth/get-session","/auth/token","/api/health","/neon-app.js?v="+version,"/neon-owner","/neon-admin","/neon-customer"];
const bodies=new Map();
for(const path of paths){
 const response=await fetch(base+path,{redirect:"manual",cache:"no-store",signal:AbortSignal.timeout(15000),headers:{accept:"application/json, text/javascript, text/html, */*"}});
 const contentType=response.headers.get("content-type")||"";
 const body=await response.text();
 bodies.set(path,body);
 console.log(JSON.stringify({path,code:response.status,contentType,bytes:body.length}));
 if(response.status>=500)throw Error(path+" responded with HTTP "+response.status);
 if(path.startsWith("/auth/")&&(contentType.includes("text/html")||response.status===404))throw Error(path+" is not routed to Neon Auth");
 if(path==="/api/health"){
  if(!response.ok)throw Error("Neon API health endpoint is unavailable");
  const health=JSON.parse(body);
  if(health.ok!==true||health.backend!=="neon"||health.authConfigured!==true)throw Error("Neon API health payload is not ready");
 }
}
const app=bodies.get("/neon-app.js?v="+version);
if(!app.includes("Email verification required")||!app.includes("ownerAccess?.approved===true")||!app.includes('"/token"')||!app.includes('credentials:"include"')||!app.includes('headers.authorization="Bearer "+await apiJwt()'))throw Error("Deployed owner/admin client is missing the audited verified-role or signed-JWT flow");
const owner=bodies.get("/neon-owner"),admin=bodies.get("/neon-admin"),customer=bodies.get("/neon-customer");
if(owner.includes('id="signup"')||admin.includes('id="signup"'))throw Error("Owner/admin dashboards must be login-only");
if(!customer.includes('id="openShopRegistration"')||!customer.includes('id="registerShop"'))throw Error("Customer shop registration modal is missing");
console.log("PASS: live Pages frontend, same-origin Neon Auth proxy, Neon API health and dashboard access controls");
