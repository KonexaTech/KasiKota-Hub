// Disposable isolated staging authentication probe.
// Never logs credentials, session cookies, JWTs, or subject IDs.
// Creates one marked test-only account if the staging Auth signup accepts the request.
import { randomBytes } from "node:crypto";
const site="https://kota-connect-neon-staging.pages.dev";
const email="kota-connect-ci-"+randomBytes(8).toString("hex")+"@example.com";
const password=randomBytes(32).toString("base64url")+"A9!";
const get=(url,opts={})=>fetch(site+url,{redirect:"manual",signal:AbortSignal.timeout(15000),...opts});
const signup=await get("/auth/sign-up/email",{method:"POST",headers:{"content-type":"application/json",origin:site},body:JSON.stringify({name:"Kota Connect CI Test",email,password})});
const signupBody=await signup.json().catch(()=>null);
const receivedCookies=signup.headers.getSetCookie?.()||[];
const cookie=receivedCookies.map(v=>v.split(";")[0]).filter(Boolean).join("; ");
console.log(JSON.stringify({stage:"signup",status:signup.status,sessionCookiesPresent:cookie.length>0,code:signupBody?.code||signupBody?.error?.code||null,message:signup.ok?null:signupBody?.message||"error"}));
if(!signup.ok)throw Error("Staging signup failed (HTTP "+signup.status+")");
if(!cookie)throw Error("Staging signup did not set a session cookie");

const session=await get("/auth/get-session",{headers:{cookie}});
const sessionData=await session.json().catch(()=>null);
console.log(JSON.stringify({stage:"session",status:session.status,hasUser:!!sessionData?.user,code:sessionData?.code||null}));
if(!session.ok||!sessionData?.user)throw Error("Session cookie did not restore Neon Auth session");

const token=await get("/auth/token",{headers:{cookie,accept:"application/json"}});
const tokenData=await token.json().catch(()=>null);
const jwt=tokenData?.token??tokenData?.data?.token;
const jwtOK=typeof jwt==="string"&&jwt.split(".").length===3;
console.log(JSON.stringify({stage:"JWT",status:token.status,hasSignedJwt:jwtOK,code:tokenData?.code||null,message:jwtOK?null:tokenData?.message||null}));
if(!token.ok||!jwtOK)throw Error("Auth token route failed (HTTP "+token.status+")");

const owner=await get("/api/me",{headers:{authorization:"Bearer "+jwt,accept:"application/json"}});
const ownerData=await owner.json().catch(()=>null);
console.log(JSON.stringify({stage:"ownerAPI",status:owner.status,ownerAllowed:ownerData?.admin===false,error:owner.ok?null:ownerData?.error||null}));
if(!owner.ok||ownerData?.admin!==false)throw Error("Staging owner role validation failed (HTTP "+owner.status+")");
console.log("PASS: signup -> cookie session -> signed JWT -> server-enforced owner identity");
