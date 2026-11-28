// Explicit reviewed staging-only initialization. Never log secrets or API bodies.
import {sourceAccessPatch,assertPreserved} from './delivery-source-access-policy.mjs';
const e=process.env,name='konexa-delivery-private-staging';
let stage='execution scope';
const check=ok=>{if(!ok)throw Error('Scope guard failed');};
async function api(path,method='GET',body){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+e.CLOUDFLARE_ACCOUNT_ID+path,{method,headers:{authorization:'Bearer '+e.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(20000)});
 check(r.status>=200&&r.status<300);const d=await r.json();check(d.success===true);return d.result;
}
try{
 check(e.GITHUB_EVENT_NAME==='workflow_dispatch'&&e.GITHUB_REF==='refs/heads/feature/neon-only-cutover'&&e.EXPECTED_SOURCE===e.GITHUB_SHA&&/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')&&e.CONFIGURE_DELIVERY_SOURCE_ACCESS==='true');
 check(/^[a-f0-9]{32}$/.test(e.CLOUDFLARE_ACCOUNT_ID||'')&&e.CLOUDFLARE_API_TOKEN&&e.KOTA_CF_ACCESS_SERVICE_TOKEN_ID&&e.KOTA_STAGING_OWNER_EMAIL);
 stage='source Access policy';const apps=await api('/access/apps');
 const source=apps.find(a=>a.id==='fe55127b-d8f8-4cb4-9e6f-27fddf226977'&&a.name==='Kota Connect QA — protected development API');
 const delivery=apps.find(a=>a.id==='253e41c5-dde6-47e9-9423-c9f58ea94bdf'&&a.domain===name+'.pages.dev');
 check(source&&delivery);
 for(const [app,token] of [[source,e.KOTA_CF_ACCESS_SERVICE_TOKEN_ID],[delivery,'40cbe72f-6c45-4903-b2fe-01df18711970']]){
  const p=await api('/access/apps/'+app.id+'/policies');
  check(p.length===2&&p.filter(x=>x.decision==='allow'&&x.include?.length===1&&x.include[0].email?.email===e.KOTA_STAGING_OWNER_EMAIL).length===1&&p.filter(x=>x.decision==='non_identity'&&x.include?.length===1&&x.include[0].service_token?.token_id===token).length===1&&p.every(x=>!x.require?.length&&!x.exclude?.length));
 }
 stage='private deployment source';const path='/pages/projects/'+name,before=await api(path);
 const patch=sourceAccessPatch(before,{id:e.KOTA_CF_ACCESS_CLIENT_ID,secret:e.KOTA_CF_ACCESS_CLIENT_SECRET},e.EXPECTED_DELIVERY_SOURCE);
 stage='two-secret initialization';await api(path,'PATCH',patch);
 stage='preservation postflight';assertPreserved(before,await api(path),e.EXPECTED_DELIVERY_SOURCE);
 console.log('PASS: initialized two server-only Delivery source Access bindings; existing opaque secrets and private policies preserved. New Delivery deployment and actual integration acceptance remain separate.');
}catch{console.error('FAIL: private Delivery source configuration at '+stage+'. No credentials or response bodies logged.');process.exitCode=1;}
