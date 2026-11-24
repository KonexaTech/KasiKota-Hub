// Manual, staging-only fixture bootstrap. Never modify an existing merchant.
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stagingAccessFetch } from './staging-access-fetch.mjs';
const API='https://kota-connect-api-dev.siboniisozulu.workers.dev';
const SITE='https://kota-connect-neon-staging.pages.dev';
const STAGING_REF='refs/heads/feature/neon-only-cutover';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const subject=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,198}$/.test(value);
const blocked=message=>{throw Error('BLOCKED: '+message);};
function config(env){
 if(env.KOTA_PREPARE_FRESH_TEST_SHOP!=='true'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_ACTIONS!=='true'||env.GITHUB_REF!==STAGING_REF)blocked('Fresh fixtures require explicit manual approval on the existing staging branch.');
 let target;try{target=new URL(env.KOTA_TEST_API_BASE||API);}catch{blocked('Invalid staging API target.');}
 if(target.origin!==API||target.pathname!=='/'||target.search||target.hash||target.username||target.password)blocked('Only the exact dedicated Kota staging API is allowed.');
 const commit=env.KOTA_TEST_EXPECTED_SOURCE_COMMIT;
 if(!/^[0-9a-f]{40}$/.test(commit||'')||/^0{40}$/.test(commit)||env.GITHUB_SHA!==commit)blocked('An exact matching workflow source commit is required.');
 if(!/^[0-9]{1,20}$/.test(env.GITHUB_RUN_ID||'')||!/^\d{1,8}$/.test(env.GITHUB_RUN_ATTEMPT||'')||Number(env.GITHUB_RUN_ATTEMPT)<1)blocked('A valid workflow run marker is required.');
 for(const key of ['KOTA_TEST_OWNER_EMAIL','KOTA_TEST_OWNER_PASSWORD','KOTA_TEST_ADMIN_EMAIL','KOTA_TEST_ADMIN_PASSWORD'])if(typeof env[key]!=='string'||!env[key])blocked('All four existing staging account credentials are required.');
 if(env.KOTA_TEST_OWNER_EMAIL.trim().toLowerCase()===env.KOTA_TEST_ADMIN_EMAIL.trim().toLowerCase())blocked('Owner and administrator accounts must be distinct.');
 const marker=env.GITHUB_RUN_ID+'-'+env.GITHUB_RUN_ATTEMPT;
 return {commit,shopName:'TEST Kota QA '+marker,itemName:'TEST Kota item '+marker};
}
function id(value,label){if(typeof value!=='string'||!uuid.test(value)||/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value))blocked('Invalid '+label+' response.');return value.toLowerCase();}
export async function prepareFreshStagingRoleFixtures(env,{fetchImpl=globalThis.fetch}={}){
 const c=config(env);
 const accessFetch=stagingAccessFetch(env,fetchImpl);
 async function request(origin,path,{method='GET',headers={},body,expected=200,label}={}){
  let response;try{response=await accessFetch(origin+path,{method,headers:{accept:'application/json',...(body===undefined?{}:{'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000)});}catch{blocked((label||'Staging')+' request failed. No retry or substitute target was used.');}
  if(response.status!==expected)blocked((label||'Staging')+' returned unexpected HTTP '+response.status+'.');
  let data;try{data=await response.json();}catch{blocked((label||'Staging')+' response was not valid JSON.');}
  return {data,response};
 }
 const health=(await request(API,'/api/health',{label:'Source health'})).data;
 if(health?.ok!==true||health.backend!=='neon'||health.sourceCommit!==c.commit)blocked('Deployed staging API does not match this workflow source commit.');
 async function login(email,password,label){
  const {response}=await request(SITE,'/auth/sign-in/email',{method:'POST',headers:{origin:SITE},body:{email,password},label:label+' sign-in'});
  const cookie=(response.headers.getSetCookie?.()||[]).map(value=>value.split(';')[0]).filter(Boolean).join('; ');
  if(!cookie)blocked(label+' sign-in did not establish a session.');
  const session=(await request(SITE,'/auth/get-session',{headers:{cookie},label:label+' session'})).data;
  if(session?.user?.emailVerified!==true||!subject(session.user.id)||typeof session.user.email!=='string'||session.user.email.trim().toLowerCase()!==email.trim().toLowerCase())blocked(label+' requires the matching verified existing staging account.');
  const tokenResult=(await request(SITE,'/auth/token',{headers:{cookie},label:label+' token'})).data;
  const token=tokenResult?.token??tokenResult?.data?.token;
  if(typeof token!=='string'||token.split('.').length!==3||/[\r\n]/.test(token))blocked(label+' signed token is unavailable.');
  return {subject:session.user.id,headers:{authorization:'Bearer '+token}};
 }
 const [owner,admin]=await Promise.all([login(env.KOTA_TEST_OWNER_EMAIL,env.KOTA_TEST_OWNER_PASSWORD,'Owner'),login(env.KOTA_TEST_ADMIN_EMAIL,env.KOTA_TEST_ADMIN_PASSWORD,'Administrator')]);
 if(owner.subject===admin.subject)blocked('Distinct staging subjects are required.');
 const ownerIdentity=(await request(API,'/api/me',{headers:owner.headers,label:'Owner identity'})).data;
 const adminIdentity=(await request(API,'/api/me',{headers:admin.headers,label:'Administrator identity'})).data;
 if(ownerIdentity?.subject!==owner.subject||ownerIdentity.admin!==false||adminIdentity?.subject!==admin.subject||adminIdentity.admin!==true)blocked('Authenticated staging subjects and roles did not match.');
 const existing=(await request(API,'/api/shop-applications/mine',{headers:owner.headers,label:'Owned applications preflight'})).data;
 if(!Array.isArray(existing?.applications)||existing.applications.some(row=>row?.shop_name===c.shopName))blocked('This run marker already has an application; no existing record will be reused or approved.');
 const created=(await request(API,'/api/shop-applications',{method:'POST',headers:owner.headers,body:{ownerName:'TEST acceptance owner',shopName:c.shopName,phone:'0000000000',area:'Newcastle CBD',address:'TEST ONLY - no real collection or delivery',description:'TEST ONLY controlled staging fixture. No real transactions or payments.'},expected:201,label:'Fresh test application'})).data;
 const applicationId=id(created?.application?.id,'application ID');
 if(created.application.status!=='pending')blocked('New test application was not pending.');
 const ownList=(await request(API,'/api/shop-applications/mine',{headers:owner.headers,label:'Owned fresh application'})).data;
 const ownMatches=Array.isArray(ownList?.applications)?ownList.applications.filter(row=>typeof row?.id==='string'&&row.id.toLowerCase()===applicationId):[];
 if(ownMatches.length!==1||ownMatches[0].shop_name!==c.shopName||ownMatches[0].status!=='pending'||(ownMatches[0].applicant_subject!==undefined&&ownMatches[0].applicant_subject!==owner.subject))blocked('Fresh application ownership/name could not be verified.');
 const adminList=(await request(API,'/api/admin/shop-applications',{headers:admin.headers,label:'Administrator fresh-application verification'})).data;
 const adminMatches=Array.isArray(adminList?.applications)?adminList.applications.filter(row=>typeof row?.id==='string'&&row.id.toLowerCase()===applicationId):[];
 if(adminMatches.length!==1||adminMatches[0].shop_name!==c.shopName||adminMatches[0].applicant_subject!==owner.subject||adminMatches[0].status!=='pending')blocked('Administrator view did not confirm only the newly owned application.');
 const review=(await request(API,'/api/admin/shop-applications/'+applicationId+'/review',{method:'PATCH',headers:admin.headers,body:{status:'approved'},label:'Fresh application approval'})).data;
 if(review?.ok!==true)blocked('Fresh application approval was not confirmed.');
 const shops=(await request(API,'/api/owner/shops',{headers:owner.headers,label:'Owned fresh shop'})).data;
 const matches=Array.isArray(shops?.shops)?shops.shops.filter(row=>row?.name===c.shopName&&row.approved===true):[];
 if(matches.length!==1||(matches[0].owner_subject!==undefined&&matches[0].owner_subject!==owner.subject))blocked('Exactly one newly owned approved fixture shop is required.');
 const shopId=id(matches[0].id,'shop ID');
 const initialMenu=(await request(API,'/api/owner/shops/'+shopId+'/menu',{headers:owner.headers,label:'Fresh shop menu preflight'})).data;
 if(!Array.isArray(initialMenu?.items)||initialMenu.items.length!==0)blocked('Fresh fixture shop already has menu records; no existing menu will be changed.');
 const added=(await request(API,'/api/owner/shops/'+shopId+'/menu',{method:'POST',headers:owner.headers,body:{name:c.itemName,priceCents:100},expected:201,label:'Fresh TEST menu item'})).data;
 const menuItemId=id(added?.item?.id,'menu item ID');
 if(added.item.name!==c.itemName||added.item.price_cents!==100||added.item.available!==true)blocked('New fixture menu metadata was not confirmed.');
 const menu=(await request(API,'/api/owner/shops/'+shopId+'/menu',{headers:owner.headers,label:'Persisted fixture menu'})).data;
 const items=Array.isArray(menu?.items)?menu.items.filter(row=>typeof row?.id==='string'&&row.id.toLowerCase()===menuItemId):[];
 if(items.length!==1||items[0].name!==c.itemName||items[0].price_cents!==100||items[0].available!==true)blocked('Fresh menu persistence could not be verified.');
 return {confirm_writes:'true',shop_id:shopId,menu_item_id:menuItemId,owner_subject:owner.subject,admin_subject:admin.subject};
}
export async function writeFixtureOutputs(path,result){
 if(typeof path!=='string'||!path)blocked('GitHub output file is required.');
 if(!result||Object.keys(result).sort().join(',')!=='admin_subject,confirm_writes,menu_item_id,owner_subject,shop_id'||result.confirm_writes!=='true'||!uuid.test(result.shop_id||'')||!uuid.test(result.menu_item_id||'')||!subject(result.owner_subject)||!subject(result.admin_subject)||result.owner_subject===result.admin_subject)blocked('Fixture outputs failed validation.');
 await appendFile(path,Object.entries(result).map(([key,value])=>`${key}=${value}\n`).join(''));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(!process.env.GITHUB_OUTPUT)blocked('GitHub output file is required before preparing fixtures.');
  const result=await prepareFreshStagingRoleFixtures(process.env);await writeFixtureOutputs(process.env.GITHUB_OUTPUT,result);
  console.log('PASS: Fresh TEST shop and menu prepared using verified staging roles; existing merchant records were not changed.');
 }catch(error){console.error(error.message);process.exitCode=1;}
}
