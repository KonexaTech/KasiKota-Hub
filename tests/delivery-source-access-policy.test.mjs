import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceAccessPatch,assertPreserved} from '../worker/scripts/delivery-source-access-policy.mjs';
const sha='a'.repeat(40),source={repo_id:'1467163423',owner:'KonexaTech',repo_name:'Konexa-Delivery',preview_deployment_setting:'none'};
const project=()=>({name:'konexa-delivery-private-staging',production_branch:'qa/delivery-edge-staging-20261125',domains:['konexa-delivery-private-staging.pages.dev'],source:{config:source},canonical_deployment:{environment:'production',latest_stage:{status:'success'},deployment_trigger:{metadata:{branch:'qa/delivery-edge-staging-20261125',commit_hash:sha}}},deployment_configs:{production:{wrangler_config_hash:'fixture-config-hash',env_vars:{DELIVERY_ENV:{type:'plain_text',value:'staging'},PUBLIC_ORIGIN:{type:'plain_text',value:'https://konexa-delivery-private-staging.pages.dev'},EXPECTED_NEON_HOST:{type:'plain_text',value:'ep-young-glitter-bgm0izt0.c-9.eu-central-1.aws.neon.tech'},DELIVERY_SOURCE_CONFIG:{type:'secret_text'},DELIVERY_PIN_HMAC_KEY_BASE64:{type:'secret_text'}}}}});
test('Pages upsert changes only the two named secret bindings and preserves the config hash',()=>{
 const patch=sourceAccessPatch(project(),{id:'fixture-id',secret:'fixture-secret'},sha);
 assert.deepEqual(patch,{deployment_configs:{production:{wrangler_config_hash:'fixture-config-hash',env_vars:{KOTA_SOURCE_CF_ACCESS_CLIENT_ID:{type:'secret_text',value:'fixture-id'},KOTA_SOURCE_CF_ACCESS_CLIENT_SECRET:{type:'secret_text',value:'fixture-secret'}}}}});
 assert.equal(JSON.stringify(patch).includes('DELIVERY_SOURCE_CONFIG'),false);
});
test('wrong source, public targets, non-staging modes and missing credentials reject before any upsert',()=>{
 for(const mutate of [p=>p.name='production',p=>p.production_branch='main',p=>p.domains.push('public.example'),p=>p.source.config={...source,repo_id:'1'},p=>p.canonical_deployment.deployment_trigger.metadata.commit_hash='b'.repeat(40),p=>p.canonical_deployment.environment='preview',p=>p.deployment_configs.production.env_vars.DELIVERY_ENV.value='production',p=>p.deployment_configs.production.env_vars.DELIVERY_SOURCE_CONFIG.type='plain_text']){const p=project();mutate(p);assert.throws(()=>sourceAccessPatch(p,{id:'fixture-id',secret:'fixture-secret'},sha));}
 for(const c of [{},{id:'fixture-id'},{id:'fixture-id',secret:'bad\nsecret'}])assert.throws(()=>sourceAccessPatch(project(),c,sha));
});
test('postflight rejects missing old bindings and changed non-secret state without inspecting opaque secret values',()=>{
 const before=project(),after=structuredClone(before);Object.assign(after.deployment_configs.production.env_vars,{KOTA_SOURCE_CF_ACCESS_CLIENT_ID:{type:'secret_text'},KOTA_SOURCE_CF_ACCESS_CLIENT_SECRET:{type:'secret_text'}});assertPreserved(before,after,sha);
 delete after.deployment_configs.production.env_vars.DELIVERY_PIN_HMAC_KEY_BASE64;assert.throws(()=>assertPreserved(before,after,sha));
});

test('guarded setup script performs one fixed private upsert with redacted logs against fixture APIs',async()=>{
 const {spawnSync}=await import('node:child_process'),{fileURLToPath}=await import('node:url');
 const script=fileURLToPath(new URL('../worker/scripts/configure-delivery-source-access.mjs',import.meta.url));
 const env={PATH:process.env.PATH,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/feature/neon-only-cutover',GITHUB_SHA:sha,EXPECTED_SOURCE:sha,EXPECTED_DELIVERY_SOURCE:sha,CONFIGURE_DELIVERY_SOURCE_ACCESS:'true',CLOUDFLARE_ACCOUNT_ID:'f'.repeat(32),CLOUDFLARE_API_TOKEN:'fixture-api-never-log',KOTA_CF_ACCESS_SERVICE_TOKEN_ID:'fixture-source-token',KOTA_STAGING_OWNER_EMAIL:'owner@example.test',KOTA_CF_ACCESS_CLIENT_ID:'fixture-client-never-log',KOTA_CF_ACCESS_CLIENT_SECRET:'fixture-secret-never-log'};
 const fixture='let p='+JSON.stringify(project())+';let patches=0;'+
 "globalThis.fetch=async(url,init)=>{const u=new URL(url);assert.equal(u.origin,'https://api.cloudflare.com');assert.equal(init.redirect,'manual');assert.equal(init.headers.authorization,'Bearer fixture-api-never-log');let result;const base='/client/v4/accounts/'+'f'.repeat(32);"+
 "if(u.pathname===base+'/access/apps')result=[{id:'fe55127b-d8f8-4cb4-9e6f-27fddf226977',name:'Kota Connect QA — protected development API'},{id:'253e41c5-dde6-47e9-9423-c9f58ea94bdf',domain:'konexa-delivery-private-staging.pages.dev'}];"+
 "else if(u.pathname.endsWith('/policies'))result=[{decision:'allow',include:[{email:{email:'owner@example.test'}}],require:[],exclude:[]},{decision:'non_identity',include:[{service_token:{token_id:u.pathname.includes('fe55127b')?'fixture-source-token':'40cbe72f-6c45-4903-b2fe-01df18711970'}}],require:[],exclude:[]}];"+
 "else {assert.equal(u.pathname,base+'/pages/projects/konexa-delivery-private-staging');if(init.method==='PATCH'){patches++;const b=JSON.parse(init.body);assert.deepEqual(Object.keys(b.deployment_configs.production.env_vars).sort(),['KOTA_SOURCE_CF_ACCESS_CLIENT_ID','KOTA_SOURCE_CF_ACCESS_CLIENT_SECRET']);Object.assign(p.deployment_configs.production.env_vars,b.deployment_configs.production.env_vars);}result=p;}return Response.json({success:true,result});};";
 for(const approved of [true,false]){
  const preload="import assert from 'node:assert/strict';"+fixture+"process.on('exit',()=>assert.equal(patches,"+(approved?1:0)+"));";
  const r=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(preload),script],{env:{...env,CONFIGURE_DELIVERY_SOURCE_ACCESS:approved?'true':'false'},encoding:'utf8'});
  assert.equal(r.status,approved?0:1,r.stderr);assert.doesNotMatch(r.stdout+r.stderr,/fixture-api-never-log|fixture-client-never-log|fixture-secret-never-log/);
  assert.match(approved?r.stdout:r.stderr,approved?/PASS: initialized two/:/FAIL:.*execution scope/);
 }
});

test('source setup refuses to overwrite an existing credential binding',()=>{const p=project();p.deployment_configs.production.env_vars.KOTA_SOURCE_CF_ACCESS_CLIENT_ID={type:'secret_text'};assert.throws(()=>sourceAccessPatch(p,{id:'fixture-id',secret:'fixture-secret'},sha));});
