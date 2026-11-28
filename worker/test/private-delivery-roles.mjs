// Actual deployed-role acceptance only when explicitly configured. No driver/job/finance writes.
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const origin='https://konexa-delivery-private-staging.pages.dev';
const names=['DELIVERY_TEST_ACCESS_CLIENT_ID','DELIVERY_TEST_ACCESS_CLIENT_SECRET','DELIVERY_TEST_ADMIN_EMAIL','DELIVERY_TEST_ADMIN_PASSWORD','DELIVERY_TEST_DRIVER_EMAIL','DELIVERY_TEST_DRIVER_PASSWORD','DELIVERY_TEST_OTHER_DRIVER_EMAIL','DELIVERY_TEST_OTHER_DRIVER_PASSWORD'];
export function roleConfig(env){
 const missing=names.filter(name=>typeof env[name]!=='string'||!env[name]);
 if(missing.length)throw Error('BLOCKED: private Delivery role acceptance missing '+missing.join(', ')+'. Configure private staging settings; never paste credentials in chat.');
 if(env.DELIVERY_TEST_CONFIRM_PRIVATE_ROLES!=='true'||!/^[a-f0-9]{40}$/.test(env.DELIVERY_TEST_EXPECTED_SOURCE||''))throw Error('BLOCKED: explicit private-role opt-in and exact Delivery source required.');
 if(env.DELIVERY_TEST_BASE&&env.DELIVERY_TEST_BASE!==origin)throw Error('BLOCKED: only the fixed private Delivery application is permitted.');
 for(const key of names.slice(0,2))if(!/^[\x21-\x7e]{1,1024}$/.test(env[key]))throw Error('BLOCKED: malformed private Access configuration.');
 const accounts=['ADMIN','DRIVER','OTHER_DRIVER'].map(role=>({role,email:env['DELIVERY_TEST_'+role+'_EMAIL'],password:env['DELIVERY_TEST_'+role+'_PASSWORD']}));
 if(new Set(accounts.map(a=>a.email.trim().toLowerCase())).size!==3)throw Error('BLOCKED: three distinct invited test identities required.');
 return {source:env.DELIVERY_TEST_EXPECTED_SOURCE,id:env.DELIVERY_TEST_ACCESS_CLIENT_ID,secret:env.DELIVERY_TEST_ACCESS_CLIENT_SECRET,accounts};
}
export async function verifyPrivateRoles(env,{fetcher=fetch,log=console.log}={}){
 const c=roleConfig(env),sessions=[];
 const access=(path,init={},protectedCall=true)=>{
  const url=new URL(path,origin);
  if(url.origin!==origin||url.search||url.hash||url.username||url.password)throw Error('BLOCKED: invalid private role acceptance target.');
  const headers=new Headers(init.headers);
  if(protectedCall){headers.set('CF-Access-Client-Id',c.id);headers.set('CF-Access-Client-Secret',c.secret);}
  else{headers.delete('CF-Access-Client-Id');headers.delete('CF-Access-Client-Secret');}
  return fetcher(url.href,{...init,headers,redirect:'manual',signal:AbortSignal.timeout(20000)});
 };
 const get=async(path,token)=>{const r=await access(path,{headers:token?{authorization:'Bearer '+token}:{}});return {status:r.status,data:await r.json().catch(()=>null)};};
 const check=(value,status,label)=>{if(value.status!==status)throw Error('FAIL: '+label+' expected HTTP'+status+', received HTTP'+value.status);return value.data;};
 const cookieOf=r=>(r.headers.getSetCookie?.()||[]).map(s=>s.split(';')[0]).filter(Boolean).join('; ');
 async function login(account){
  const r=await access('/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({email:account.email,password:account.password})});
  if(!r.ok)throw Error('BLOCKED: invited '+account.role+' sign-in returned HTTP'+r.status+'; verify private account/mailbox settings.');
  const cookie=cookieOf(r);if(!cookie)throw Error('BLOCKED: invited '+account.role+' requires a completed authenticated session.');
  const session={cookie,role:account.role};sessions.push(session);
  const response=await access('/auth/get-session',{headers:{cookie}}),data=await response.json().catch(()=>null);
  if(!response.ok||data?.user?.emailVerified!==true)throw Error('BLOCKED: invited '+account.role+' verified session missing.');
  const tokenResponse=await access('/auth/token',{headers:{cookie}}),tokenData=await tokenResponse.json().catch(()=>null);
  session.token=tokenData?.token??tokenData?.data?.token;
  if(!tokenResponse.ok||typeof session.token!=='string'||session.token.split('.').length!==3)throw Error('BLOCKED: invited '+account.role+' signed token missing.');
  return session;
 }
 let failure;
 try{
  const unauthenticated=await access('/v1/health',{},false);
  if(![302,401,403].includes(unauthenticated.status))throw Error('FAIL: private application is not denied without Access credentials.');
  const health=check(await get('/v1/health'),200,'private health');
  if(health.sourceCommit!==c.source||health.ok!==true||health.payments_enabled!==false)throw Error('FAIL: deployed Delivery source/readiness mismatch.');
  check(await get('/v1/me'),401,'missing application token');
  for(const account of c.accounts)await login(account);
  for(const session of sessions){
   const me=check(await get('/v1/me',session.token),200,'real '+session.role+' identity');
   if(me.source!=='delivery'||me.administrator!==(session.role==='ADMIN'))throw Error('FAIL: actual role isolation mismatch.');
   check(await get('/v1/admin/drivers',session.token),session.role==='ADMIN'?200:403,'administrator boundary');
   check(await get('/v1/me',session.token.split('.').map((part,index)=>index===2?(part.startsWith('a')?'b':'a')+part.slice(1):part).join('.')),401,'invalid token');
  }
  const a=check(await get('/v1/driver',sessions[1].token),200,'first own driver').driver;
  const b=check(await get('/v1/driver',sessions[2].token),200,'second own driver').driver;
  if(!a||!b||a.id===b.id||[a,b].some(d=>d.vehicle_type!=='bicycle'||d.approval_status!=='approved'))throw Error('BLOCKED: two distinct approved bicycle test drivers are required.');
  const bad=await access('/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({email:c.accounts[1].email,password:randomBytes(32).toString('hex')})});
  if(bad.ok){const cookie=cookieOf(bad);if(cookie)sessions.push({cookie,role:'UNEXPECTED_LOGIN'});throw Error('FAIL: wrong password accepted.');}
  if(![400,401,403].includes(bad.status))throw Error('BLOCKED: wrong-password test did not reach an authentication rejection.');
  log('PASS: LIVE_PRIVATE_DELIVERY_ROLES exact-source Access boundary, three real sessions, two approved bicycle drivers, admin isolation, invalid-token and wrong-password denial. No job, GPS, availability or financial writes.');
 }catch(error){failure=error;}
 finally{
  let cleanupFailed=false;
  for(const session of sessions){
   try{
    const out=await access('/auth/sign-out',{method:'POST',headers:{cookie:session.cookie,origin,'content-type':'application/json'},body:'{}'});
    const response=await access('/auth/get-session',{headers:{cookie:session.cookie}}),value=await response.json();
    if(!out.ok||!response.ok||!(value===null||value?.user===null))cleanupFailed=true;
   }catch{cleanupFailed=true;}
  }
  if(cleanupFailed&&!failure)failure=Error('FAIL: server session sign-out could not be confirmed.');
 }
 if(failure)throw failure;
 log('PASS: LIVE_PRIVATE_DELIVERY_LOGOUT all acceptance sessions absent after server sign-out; no claim of instantaneous JWT revocation.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 verifyPrivateRoles(process.env).catch(e=>{console.error(/^(FAIL|BLOCKED):/.test(e.message)?e.message:'FAIL: private Delivery role verification unavailable.');process.exitCode=1;});
}
