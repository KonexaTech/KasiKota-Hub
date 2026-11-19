// Probe public staging routes without storing or printing credentials.
const base="https://kota-connect-neon-staging.pages.dev";
for(const path of ["/auth/get-session","/auth/token","/api/health","/neon-app.js?v=20261119-owner-signin-v10"]){
 const response=await fetch(base+path,{redirect:"manual",signal:AbortSignal.timeout(12000),headers:{accept:"application/json"}});
 const contentType=response.headers.get("content-type")||"";
 const body=await response.text();
 const sample=body.slice(0,300).replace(/"token"\s*:\s*"[^"]+"/g,'"token":"[REDACTED]"');
 const status={path,code:response.status,contentType,bytes:body.length,first:sample};
 console.log(JSON.stringify(status));
 if(response.status>=500)throw Error(path+" responded with HTTP "+response.status);
 if(path.startsWith("/auth/") && (contentType.includes("text/html")||response.status===404))
    throw Error(path+" is not routed to Neon Auth");
 if(path==="/neon-app.js?v=20261119-direct-token-v2" && !body.includes('fetch(tokenUrl,'))
    throw Error("Deployed frontend still uses the stale token flow");
}
