// Disposable staging-only auth probe. Never logs email, password, cookie, JWT or user ID.
import { randomBytes } from "node:crypto";
const site="https://kota-connect-neon-staging.pages.dev";
const email="kota-connect-ci-"+randomBytes(8).toString("hex")+"@example.com";
const password=randomBytes(32).toString("base64url")+"A9!";
const get=(url,opts={})=>fetch(site+url,{redirect:"manual",signal:AbortSignal.timeout(15000),...opts});
const signup=await get("/auth/sign-up/email",{method:"POST",headers:{"content-type":"application/json",origin:site},body:JSON.stringify({name:"Kota Connect CI Test",email,password})});
const signupBody=await signup.json().catch(()=>null);
const receivedCookies=signup.headers.getSetCookie?.()||[];
const cookie=receivedCookies.map(v=>v.split(";")[0]).filter(Boolean).join("; ");
console.log(JSON.stringify({stage:"signup",status:signup.status,sessionCookiesPresent:cookie.length>0,code:signupBody?.code||signupBody?.error?.code||null}));
if(!signup.ok)throw Error("Staging signup failed (HTTP "+signup.status+")");
if(!cookie)throw Error("Staging signup did not set a session cookie");
const session=await get("/auth/get-session",{headers:{cookie}});
const sessionData=await session.json().catch(()=>null);
console.log(JSON.stringify({stage:"session",status:session.status,hasUser:!!sessionData?.user}));
if(!session.ok||!sessionData?.user)throw Error("Session cookie did not restore Neon Auth session");
const token=await get("/auth/token",{headers:{cookie,accept:"application/json"}});
const tokenData=await token.json().catch(()=>null);
const jwt=tokenData?.token??tokenData?.data?.token;
const jwtOK=typeof jwt==="string"&&jwt.split(".").length===3;
let claims={};
if(jwtOK){try{claims=JSON.parse(Buffer.from(jwt.split(".")[1],"base64url").toString("utf8"))}catch{}}
console.log(JSON.stringify({stage:"JWT",status:token.status,hasSignedJwt:jwtOK,hasIssuer:typeof claims.iss==="string",hasAudience:Object.prototype.hasOwnProperty.call(claims,"aud"),hasSubject:typeof claims.sub==="string"}));
if(!token.ok||!jwtOK)throw Error("Auth token route failed (HTTP "+token.status+")");
for(const route of ["/api/me","/api/owner/orders"]){
 const response=await get(route,{headers:{authorization:"Bearer "+jwt,accept:"application/json"}});
 const data=await response.json().catch(()=>null);
 console.log(JSON.stringify({stage:"unverified-account-gate",route,status:response.status,blockedByEmailVerification:response.status===403&&String(data?.error||"").includes("Email verification required")}));
 if(response.status!==403||!String(data?.error||"").includes("Email verification required"))throw Error(route+" did not reject an unverified signed account");
}
console.log("PASS: Neon Auth cookie -> signed JWT -> server accepts signature but blocks unverified owner/admin access");
