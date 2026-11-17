// Privileged Kota Connect actions. Never expose FIREBASE_SERVICE_ACCOUNT_JSON to browser clients.
import { createPrivateKey, sign } from "node:crypto";
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const b64=x=>Buffer.from(x).toString("base64url");
const safeJson=async req=>{try{return await req.json()}catch{return null}};
let cached=null;
async function googleToken(env){
  const sa=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON||"null");
  if(!sa?.client_email||!sa?.private_key||!sa?.project_id||sa.project_id!==env.FIREBASE_PROJECT_ID)throw Error("Firebase service account not configured");
  if(cached?.expires>Date.now()+60000)return cached.token;
  const now=Math.floor(Date.now()/1000),header={alg:"RS256",typ:"JWT"},payload={iss:sa.client_email,scope:"https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3500};
  const unsigned=b64(JSON.stringify(header))+"."+b64(JSON.stringify(payload));
  const signature=sign("RSA-SHA256",Buffer.from(unsigned),createPrivateKey(sa.private_key));
  const body=new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:unsigned+"."+b64(signature)});
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",body});
  const result=await response.json();if(!response.ok||!result.access_token)throw Error("Google OAuth unavailable");
  cached={token:result.access_token,expires:Date.now()+Number(result.expires_in||3000)*1000};return cached.token;
}
async function googleRequest(env,url,options={}){
  const token=await googleToken(env);
  const response=await fetch(url,{...options,headers:{authorization:"Bearer "+token,"content-type":"application/json",...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){console.error("Firebase admin request failed",response.status);throw Error("Firebase admin service unavailable")}
  return data;
}
function field(doc,name){const v=doc.fields?.[name];return v?.stringValue??v?.integerValue??null}
const uidPattern=/^[A-Za-z0-9_-]{8,128}$/;
const firestoreIdPattern=/^[A-Za-z0-9_-]{1,1500}$/;
export async function privilegedRoute(request,env,verify,withDb){
  const path=new URL(request.url).pathname;
  if(!["/api/admin/approve","/api/admin/revoke","/api/notifications/register","/api/notifications/order-created"].includes(path))return null;
  if(request.method!=="POST")return reply({error:"Method not allowed"},405);
  const uid=await verify(request,env);if(!uid)return reply({error:"Authentication required"},401);
  const data=await safeJson(request);if(!data||typeof data!=="object")return reply({error:"Invalid request"},400);
  if(path.startsWith("/api/admin/")){
    if(uid!==env.ADMIN_UID)return reply({error:"Primary administrator required"},403);
    const target=String(data.uid||"");if(!uidPattern.test(target)||target===env.ADMIN_UID)return reply({error:"Invalid target account"},400);
    const approve=path.endsWith("/approve");
    // Admin custom claims can only be assigned by a privileged service account.
    const lookup=await googleRequest(env,"https://identitytoolkit.googleapis.com/v1/projects/"+encodeURIComponent(env.FIREBASE_PROJECT_ID)+"/accounts:lookup",{method:"POST",body:JSON.stringify({localId:[target]})});
    const user=lookup.users?.[0];if(!user||user.disabled||!user.emailVerified)return reply({error:"Account not found, disabled or email unverified"},422);
    let claims={};try{claims=JSON.parse(user.customAttributes||"{}")}catch{}
    if(approve)claims.kotaAdmin=true;else delete claims.kotaAdmin;
    await googleRequest(env,"https://identitytoolkit.googleapis.com/v1/projects/"+encodeURIComponent(env.FIREBASE_PROJECT_ID)+"/accounts:update",{method:"POST",body:JSON.stringify({localId:target,customAttributes:JSON.stringify(claims)})});
    return reply({ok:true,uid:target,approved:approve,note:"User must refresh their ID token; Firestore rules must enforce the kotaAdmin claim."});
  }
  if(path==="/api/notifications/register"){
    const token=String(data.token||"");if(token.length<40||token.length>4096)return reply({error:"Invalid device token"},400);
    const ownerDocs=await googleRequest(env,"https://firestore.googleapis.com/v1/projects/"+encodeURIComponent(env.FIREBASE_PROJECT_ID)+"/databases/(default)/documents:runQuery",{method:"POST",body:JSON.stringify({structuredQuery:{from:[{collectionId:"shops"}],where:{fieldFilter:{field:{fieldPath:"ownerUid"},op:"EQUAL",value:{stringValue:uid}}},limit:25}})});
    if(!Array.isArray(ownerDocs)||!ownerDocs.some(row=>field(row.document||{},"status")==="approved"))return reply({error:"Approved shop owner account required"},403);
    await withDb(env,db=>db.query("INSERT INTO kc_push_tokens (token,owner_subject,updated_at) VALUES ($1,$2,now()) ON CONFLICT(token) DO UPDATE SET owner_subject=EXCLUDED.owner_subject,updated_at=now()",[token,uid]));
    return reply({ok:true});
  }
  const id=String(data.orderId||"");if(!firestoreIdPattern.test(id))return reply({error:"Invalid order ID"},400);
  const doc=await googleRequest(env,"https://firestore.googleapis.com/v1/projects/"+encodeURIComponent(env.FIREBASE_PROJECT_ID)+"/databases/(default)/documents/orders/"+encodeURIComponent(id));
  if(field(doc,"customerUid")!==uid)return reply({error:"Order owner mismatch"},403);
  const ownerUid=field(doc,"ownerUid"),shopId=field(doc,"shopId");if(!ownerUid||!shopId||!firestoreIdPattern.test(shopId)||field(doc,"orderStatus")!=="pending")return reply({error:"Invalid order notification state"},422);
  const shop=await googleRequest(env,"https://firestore.googleapis.com/v1/projects/"+encodeURIComponent(env.FIREBASE_PROJECT_ID)+"/databases/(default)/documents/shops/"+encodeURIComponent(shopId));
  if(field(shop,"ownerUid")!==ownerUid||field(shop,"status")!=="approved")return reply({error:"Shop ownership mismatch"},403);
  const result=await withDb(env,async db=>{
    const reserved=await db.query("INSERT INTO kc_push_dispatch (order_id,owner_subject) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING order_id",[id,ownerUid]);
    if(!reserved.rowCount)return {alreadySent:true};
    const tokens=(await db.query("SELECT token FROM kc_push_tokens WHERE owner_subject=$1 ORDER BY updated_at DESC LIMIT 20",[ownerUid])).rows;
    if(!tokens.length){await db.query("DELETE FROM kc_push_dispatch WHERE order_id=$1",[id]);return {sent:0,reason:"No registered owner devices"}}
    let sent=0;
    for(const row of tokens){
      try{
        await googleRequest(env,"https://fcm.googleapis.com/v1/projects/"+encodeURIComponent(env.FIREBASE_PROJECT_ID)+"/messages:send",{method:"POST",body:JSON.stringify({message:{token:row.token,notification:{title:"New Kota Connect order",body:"A customer placed an order. Open your owner dashboard."},data:{type:"new_order",orderId:id},android:{priority:"high"},webpush:{fcm_options:{link:"https://siboniisozulu-alt.github.io/KasiKota-Hub/kota-connect-owners-dashboard-fixed.html"}}}})});sent++;
      }catch(e){console.error("FCM send failed",e.message)}
    }
    if(!sent)await db.query("DELETE FROM kc_push_dispatch WHERE order_id=$1",[id]);
    return {sent};
  });
  return reply({ok:true,...result});
}
