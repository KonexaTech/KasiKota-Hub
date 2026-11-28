import {liveAcceptanceConfig} from '../worker/test/live-acceptance-guard.mjs';
export const SITE='https://kota-connect-neon-staging.pages.dev';
export const API='https://kota-connect-api-dev.siboniisozulu.workers.dev';
export function protectedBrowserConfig(env){
 const c=liveAcceptanceConfig(env);
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REF!=='refs/heads/feature/neon-only-cutover'||env.GITHUB_SHA!==c.sourceCommit||env.KOTA_PREPARE_FRESH_TEST_SHOP!=='true'||!/^\d{1,20}$/.test(env.GITHUB_RUN_ID||'')||!/^\d{1,8}$/.test(env.GITHUB_RUN_ATTEMPT||'')||Number(env.GITHUB_RUN_ATTEMPT)<1)throw Error('Private browser requires exact approved fresh staging fixtures');
 for(const key of ['KOTA_CF_ACCESS_CLIENT_ID','KOTA_CF_ACCESS_CLIENT_SECRET','KOTA_TEST_OWNER_EMAIL','KOTA_TEST_OWNER_PASSWORD','KOTA_TEST_ADMIN_EMAIL','KOTA_TEST_ADMIN_PASSWORD'])if(!env[key])throw Error('Private browser credentials unavailable');
 return {...c,shopName:'TEST Kota QA '+env.GITHUB_RUN_ID+'-'+env.GITHUB_RUN_ATTEMPT};
}
export function protectedBrowserRequest(url,method,type,headers,env){
 const u=new URL(url),privateOrigin=[SITE,API].includes(u.origin);
 if(u.username||u.password||!privateOrigin&&!(method==='GET'&&['script','stylesheet','font'].includes(type)&&['https://esm.sh','https://fonts.googleapis.com','https://fonts.gstatic.com'].includes(u.origin)))return null;
 if(privateOrigin&&(!env.KOTA_CF_ACCESS_CLIENT_ID||!env.KOTA_CF_ACCESS_CLIENT_SECRET))return null;
 const safe=Object.fromEntries(Object.entries(headers).filter(([name])=>!/^cf-access-/i.test(name)&&!(!privateOrigin&&/^(authorization|cookie)$/i.test(name))));
 if(privateOrigin){safe['cf-access-client-id']=env.KOTA_CF_ACCESS_CLIENT_ID;safe['cf-access-client-secret']=env.KOTA_CF_ACCESS_CLIENT_SECRET;}
 return safe;
}
