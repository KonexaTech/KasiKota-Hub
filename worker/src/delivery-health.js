// Read-only, private-staging observability. Caller authorization lives in neon-api.
const service='https://konexa-delivery-private-staging.pages.dev';
const api='https://kota-connect-api-dev.siboniisozulu.workers.dev';
const unavailable=()=>Response.json({ok:false,error:'Delivery health unavailable'},{status:503,headers:{'cache-control':'no-store'}});
export async function deliveryHealth(request,env,fetcher=globalThis.fetch){
 if(env.NEON_ONLY_MODE!=='true'||new URL(request.url).origin!==api||![service,service+'/'].includes(env.DELIVERY_SERVICE_URL)||![env.DELIVERY_CF_ACCESS_CLIENT_ID,env.DELIVERY_CF_ACCESS_CLIENT_SECRET].every(x=>typeof x==='string'&&x.length>0&&x.length<=1024&&!/[^\x21-\x7e]/.test(x)))return unavailable();
 try{
  const response=await fetcher(service+'/v1/health',{method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),headers:{accept:'application/json','cf-access-client-id':env.DELIVERY_CF_ACCESS_CLIENT_ID,'cf-access-client-secret':env.DELIVERY_CF_ACCESS_CLIENT_SECRET}});
  if(response.status!==200)return unavailable();
  const text=await response.text();if(text.length>4096)return unavailable();const data=JSON.parse(text);
  if(data?.ok!==true||data.service!=='konexa-delivery'||data.payments_enabled!==false||data.driver_schema_ready!==true||data.auth_schema_ready!==true||data.status_schema_ready!==true||typeof data.sourceCommit!=='string'||!/^[a-f0-9]{40}$/.test(data.sourceCommit))return unavailable();
  return Response.json({ok:true,delivery_source_commit:data.sourceCommit,payments_enabled:false},{headers:{'cache-control':'no-store'}});
 }catch{return unavailable();}
}
