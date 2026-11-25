// Staging-only deployment preflight; never log credentials or response bodies.
import { Client } from 'pg';
const mode=process.argv[2];
const e=process.env;
let stage='staging source verification';
const pages='kota-connect-neon-staging';
const site='https://'+pages+'.pages.dev';
const worker='kota-connect-api-dev';
const api='https://'+worker+'.siboniisozulu.workers.dev';
const host='ep-lively-leaf-za5rtfhs.c-2.eu-west-2.aws.neon.tech';
function requireThat(ok,label){if(!ok)throw Error(label);}
async function cf(path,label){
  stage='Cloudflare API: '+label;
  let r;
  try{r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+e.CLOUDFLARE_ACCOUNT_ID+path,{headers:{authorization:'Bearer '+e.CLOUDFLARE_API_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});}
  catch{throw Error('Cloudflare API network request failed');}
  requireThat(r.ok,'Cloudflare API returned HTTP '+r.status);
  let body;
  try{body=await r.json();}catch{throw Error('Cloudflare API response was not valid JSON');}
  requireThat(body.success===true,'Cloudflare API returned an unsuccessful response');
  return body.result;
}
function denied(r){
  const location=r.headers.get('location')||'';
  return (r.status===302||r.status===303||r.status===307||r.status===308)&&(/\.cloudflareaccess\.com\//i.test(location)||/\/cdn-cgi\/access\/login/i.test(location)) || (r.status===401||r.status===403)&&Boolean(r.headers.get('cf-access-denied')||r.headers.get('cf-access-login-url'));
}
async function probe(url,label,authenticated=false){
  stage='Cloudflare Access probe: '+label;
  const headers=authenticated?{'CF-Access-Client-Id':e.KOTA_CF_ACCESS_CLIENT_ID,'CF-Access-Client-Secret':e.KOTA_CF_ACCESS_CLIENT_SECRET}:{};
  try{return await fetch(url,{headers,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000)});}
  catch{throw Error('Cloudflare Access probe network request failed');}
}
async function protections(){
  requireThat(/^[a-f0-9]{32}$/i.test(e.CLOUDFLARE_ACCOUNT_ID||'')&&e.CLOUDFLARE_API_TOKEN&&e.KOTA_CF_ACCESS_CLIENT_ID&&e.KOTA_CF_ACCESS_CLIENT_SECRET&&e.KOTA_CF_ACCESS_SERVICE_TOKEN_ID,'Missing protected staging credentials');
  const p=await cf('/pages/projects/'+pages,'Pages project settings');
  const c=p.source?.config;
  requireThat(p.name===pages&&p.subdomain===pages+'.pages.dev'&&p.production_branch==='feature/neon-only-cutover','Unexpected Pages target');
  requireThat(c?.repo_id==='1423509216'&&c.production_deployments_enabled===false&&c.preview_deployment_setting==='none'&&c.deployments_enabled===false,'Pages source or automatic deployment settings changed');
  for(const cfg of [p.deployment_configs?.production,p.deployment_configs?.preview]){
    const binding=(cfg?.services||cfg?.service_bindings)?.QA_API;
    requireThat(binding?.service===worker&&binding.environment==='production','Private Pages binding missing');
  }
  requireThat((p.domains||[]).every(x=>x===pages+'.pages.dev'),'Unexpected Pages domain');
  const sub=await cf('/workers/scripts/'+worker+'/subdomain','Worker subdomain settings');
  requireThat(sub.enabled===true&&sub.previews_enabled===false,'Worker endpoint settings changed');
  const settings=await cf('/workers/scripts/'+worker+'/settings','Worker bindings');
  requireThat(settings.bindings?.some(x=>x.name==='DATABASE_URL'&&x.type==='secret_text')&&!settings.bindings?.some(x=>x.name==='HYPERDRIVE'),'Unexpected Worker database binding');
  const apps=await cf('/access/apps','Access applications');
  const pageApp=apps.find(x=>x.name==='Kota Connect QA — owner-only Pages staging'&&x.self_hosted_domains?.includes(pages+'.pages.dev')&&x.self_hosted_domains?.includes('*.'+pages+'.pages.dev'));
  const apiApp=apps.find(x=>x.name==='Kota Connect QA — protected development API'&&x.destinations?.length===1&&x.destinations[0].type==='worker');
  requireThat(pageApp&&apiApp,'Required Access applications missing');
  for(const a of [pageApp,apiApp]){
    const policies=await cf('/access/apps/'+a.id+'/policies','Access policies for '+(a.name.includes('Pages')?'Pages':'Worker'));
    const owner=policies.filter(x=>x.decision==='allow'&&x.include?.length===1&&x.include[0].email?.email===e.KOTA_STAGING_OWNER_EMAIL);
    const service=policies.filter(x=>x.decision==='non_identity'&&x.include?.length===1&&x.include[0].service_token?.token_id===e.KOTA_CF_ACCESS_SERVICE_TOKEN_ID);
    requireThat(owner.length===1&&service.length===1&&policies.length===2,'Access policy does not match reviewed owner and QA service identity');
  }
  const urls=[site+'/neon-customer.html',api+'/api/health'];
  for(const url of urls){
    requireThat(denied(await probe(url,'anonymous '+(url.includes('.pages.dev')?'Pages':'Worker'))),'Anonymous Access denial not established');
    const authenticated=await probe(url,'service identity '+(url.includes('.pages.dev')?'Pages':'Worker'),true);
    requireThat(authenticated.ok,'QA service identity returned HTTP '+authenticated.status);
  }
  if(p.latest_deployment?.url){
    const preview=new URL(p.latest_deployment.url);
    requireThat(preview.protocol==='https:'&&preview.hostname.endsWith('.'+pages+'.pages.dev'),'Unexpected preview URL');
    requireThat(denied(await probe(preview.origin+'/neon-customer.html','preview Pages anonymous')),'Preview is not Access protected');
  }
}
async function database(){
  requireThat(e.KOTA_STAGING_DATABASE_URL,'Missing restricted staging database credential');
  const u=new URL(e.KOTA_STAGING_DATABASE_URL);
  requireThat(['postgres:','postgresql:'].includes(u.protocol)&&u.hostname===host&&u.pathname==='/neondb'&&u.username==='kc_staging_worker'&&u.password&&(!u.port||u.port==='5432')&&!u.hash,'Wrong staging database target or role');
  requireThat([...u.searchParams.keys()].every(k=>k==='sslmode'||k==='channel_binding'),'Unsupported database connection option');
  u.searchParams.delete('sslmode');u.searchParams.delete('channel_binding');
  const client=new Client({connectionString:u.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000,statement_timeout:10000});
  try{
    await client.connect();
    const result=await client.query(`SELECT current_user='kc_staging_worker' AND current_database()='neondb' AS correct_identity,
      NOT (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls OR rolreplication) AS restricted,
      NOT has_schema_privilege(current_user,'public','CREATE') AND NOT has_schema_privilege(current_user,'neon_auth','CREATE') AS no_schema_create,
      NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('neon_superuser','neondb_owner') AND pg_has_role(current_user,r.oid,'MEMBER')) AS no_owner_membership,
      has_table_privilege(current_user,'public.kc_orders','SELECT') AND has_column_privilege(current_user,'public.kc_orders','status','UPDATE') AS order_access,
      NOT has_table_privilege(current_user,'public.kc_orders','DELETE,TRUNCATE') AND NOT has_table_privilege(current_user,'public.kc_admins','INSERT,UPDATE,DELETE,TRUNCATE') AS no_sensitive_writes,
      NOT has_table_privilege(current_user,'public.kc_commission_entries','INSERT,UPDATE,DELETE,TRUNCATE') AND NOT has_table_privilege(current_user,'public.kc_commission_payments','INSERT,UPDATE,DELETE,TRUNCATE') AS no_financial_writes,
      has_column_privilege(current_user,'neon_auth."user"','id','SELECT') AND has_column_privilege(current_user,'neon_auth."user"','emailVerified','SELECT') AND NOT has_table_privilege(current_user,'neon_auth."user"','UPDATE,DELETE,INSERT,TRUNCATE') AS auth_scope
      FROM pg_roles WHERE rolname=current_user`);
    requireThat(result.rows.length===1&&Object.values(result.rows[0]).every(x=>x===true),'Restricted runtime privilege checks failed');
  }finally{await client.end().catch(()=>{});}
}
try{
  requireThat(mode==='before'||mode==='after','Invalid preflight mode');
  requireThat(e.GITHUB_REF==='refs/heads/feature/neon-only-cutover'&&/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')&&e.EXPECTED_SOURCE===e.GITHUB_SHA,'Wrong branch or source');
  stage='Cloudflare target and Access protection';
  await protections();
  if(mode==='before'){stage='restricted Neon database connection and permissions';await database();}
  if(mode==='after'){
    const healthResponse=await probe(api+'/api/health','post-deployment Worker health',true);
    requireThat(healthResponse.ok,'Post-deployment Worker health returned HTTP '+healthResponse.status);
    const markerResponse=await probe(site+'/qa-source.json','post-deployment Pages source marker',true);
    requireThat(markerResponse.ok,'Post-deployment Pages marker returned HTTP '+markerResponse.status);
    const health=await healthResponse.json();
    const marker=await markerResponse.json();
    requireThat(health.ok===true&&health.backend==='neon'&&health.sourceCommit===e.GITHUB_SHA&&marker.sourceCommit===e.GITHUB_SHA,'Deployed source markers do not match');
  }
  console.log('Protected staging '+mode+' gate passed.');
}catch(error){
  const message=error instanceof Error?error.message:'';
  const safe=/^(?:Cloudflare API returned HTTP|QA service identity returned HTTP|Post-deployment Worker health returned HTTP|Post-deployment Pages marker returned HTTP) (\d{3})$/.exec(message);
  const allowed=new Set(['Invalid preflight mode','Wrong branch or source','Missing protected staging credentials','Unexpected Pages target','Pages source or automatic deployment settings changed','Private Pages binding missing','Unexpected Pages domain','Worker endpoint settings changed','Unexpected Worker database binding','Required Access applications missing','Access policy does not match reviewed owner and QA service identity','Anonymous Access denial not established','QA service identity not accepted','Preview is not Access protected','Missing restricted staging database credential','Wrong staging database target or role','Unsupported database connection option','Restricted runtime privilege checks failed','Deployed source markers do not match','Cloudflare API network request failed','Cloudflare API response was not valid JSON','Cloudflare API returned an unsuccessful response','Cloudflare Access probe network request failed']);
  const reason=safe?safe[0]:allowed.has(message)?message:'unexpected verification failure';
  console.error('BLOCKED at '+stage+': '+reason+'. No credentials logged.');process.exitCode=1;
}
