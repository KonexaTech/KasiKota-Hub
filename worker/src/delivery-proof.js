// Private staging only. Browser identity is checked locally, never forwarded to Delivery.
const origin='https://konexa-delivery-private-staging.pages.dev',path='/v1/delivery/source-verification';
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function deliveryProof(request,env,withDb,id,subject,purpose){
 if(env.NEON_ONLY_MODE!=='true'||new URL(request.url).origin!=='https://kota-connect-api-dev.siboniisozulu.workers.dev'||env.KOTA_STAGING_DELIVERY_PROOFS_ENABLED!=='true'||env.DELIVERY_DISPATCH_ENABLED!=='true'||env.DELIVERY_SERVICE_URL!==origin||
    ![env.DELIVERY_INTAKE_SECRET,env.DELIVERY_CF_ACCESS_CLIENT_ID,env.DELIVERY_CF_ACCESS_CLIENT_SECRET].every(x=>typeof x==='string'&&x.trim())||new TextEncoder().encode(env.DELIVERY_INTAKE_SECRET).length<32)return json({error:'Delivery verification unavailable'},503);
 if(!['collection','handover'].includes(purpose))return json({error:'Invalid verification request'},400);
 try{
  const raw=await request.text();let body;try{if(raw.length>128)throw Error();body=JSON.parse(raw);}catch{return json({error:'Send an empty JSON object'},400);}
  if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length)return json({error:'Send an empty JSON object'},400);
  const row=await withDb(env,async db=>(await db.query('SELECT o.customer_subject,o.test_order,o.fulfillment_type,o.status,s.owner_subject,s.approved FROM kc_orders o JOIN kc_shops s ON s.id=o.shop_id WHERE o.id=$1',[id])).rows[0]);
  if(!row||(purpose==='collection'?row.owner_subject:row.customer_subject)!==subject)return json({error:'Order not found'},404);
  if(row.test_order!==true||row.approved!==true||row.fulfillment_type!=='delivery'||!['ready_for_collection','out_for_delivery'].includes(row.status))return json({error:'Order is not ready for delivery verification'},409);
  const content=JSON.stringify({version:1,source_order_id:id,purpose}),timestamp=String(Math.floor(Date.now()/1000)),encode=x=>new TextEncoder().encode(x);
  const digest=hex(await crypto.subtle.digest('SHA-256',encode(content)));
  const canonical=['konexa-delivery-proof-v1','POST',path,'kota',timestamp,digest].join('\n');
  const key=await crypto.subtle.importKey('raw',encode(env.DELIVERY_INTAKE_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature='v1='+hex(await crypto.subtle.sign('HMAC',key,encode(canonical)));
  const response=await fetch(origin+path,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/json','x-konexa-source':'kota','x-konexa-timestamp':timestamp,'x-konexa-signature':signature,'CF-Access-Client-Id':env.DELIVERY_CF_ACCESS_CLIENT_ID,'CF-Access-Client-Secret':env.DELIVERY_CF_ACCESS_CLIENT_SECRET},body:content});
  if(response.status===409)return json({error:'Verification is not available in this state, or a code was already issued. Ask the delivery administrator to review a lost or expired code.'},409);
  if(response.status!==200)return json({error:'Delivery verification unavailable; do not guess or reuse a code'},503);
  const result=await response.json();
  if(!result||typeof result.pin!=='string'||!/^\d{6}$/.test(result.pin)||result.purpose!==purpose||result.expires_in!==900)return json({error:'Invalid delivery verification response'},502);
  return json({pin:result.pin,purpose,expires_in:900});
 }catch{return json({error:'Delivery verification unavailable; ask the delivery administrator to review if a code was already issued'},503);}
}
