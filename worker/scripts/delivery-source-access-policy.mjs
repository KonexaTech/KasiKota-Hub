const projectName='konexa-delivery-private-staging';
const branch='qa/delivery-edge-staging-20261125';
const origin='https://'+projectName+'.pages.dev';
const keys=['KOTA_SOURCE_CF_ACCESS_CLIENT_ID','KOTA_SOURCE_CF_ACCESS_CLIENT_SECRET'];
const requireThat=(ok)=>{if(!ok)throw Error('Private Delivery source setup guard failed');};
export function assertTarget(p,sha){
 requireThat(typeof sha==='string'&&/^[a-f0-9]{40}$/.test(sha));
 requireThat(p?.name===projectName&&p.production_branch===branch&&p.domains?.length===1&&p.domains[0]===projectName+'.pages.dev');
 const c=p.source?.config;
 requireThat(String(c?.repo_id)==='1467163423'&&c.owner==='KonexaTech'&&c.repo_name==='Konexa-Delivery'&&c.preview_deployment_setting==='none');
 const d=p.canonical_deployment;
 requireThat(d?.environment==='production'&&d.latest_stage?.status==='success'&&d.deployment_trigger?.metadata?.branch===branch&&d.deployment_trigger.metadata.commit_hash===sha);
 const e=p.deployment_configs?.production?.env_vars;
 requireThat(e?.DELIVERY_ENV?.type==='plain_text'&&e.DELIVERY_ENV.value==='staging'&&e.PUBLIC_ORIGIN?.value===origin&&e.EXPECTED_NEON_HOST?.value==='ep-young-glitter-bgm0izt0.c-9.eu-central-1.aws.neon.tech');
 requireThat(e.DELIVERY_SOURCE_CONFIG?.type==='secret_text'&&e.DELIVERY_PIN_HMAC_KEY_BASE64?.type==='secret_text');
 return e;
}
export function sourceAccessPatch(p,credentials,sha){
 const e=assertTarget(p,sha);
 requireThat(keys.every(k=>!(k in e)));
 requireThat([credentials.id,credentials.secret].every(x=>typeof x==='string'&&x.length>0&&x.length<=1024&&!/[^\x21-\x7e]/.test(x)));
 return {deployment_configs:{production:{wrangler_config_hash:p.deployment_configs.production.wrangler_config_hash,env_vars:Object.fromEntries(keys.map((key,i)=>[key,{type:'secret_text',value:i===0?credentials.id:credentials.secret}]))}}};
}
export function assertPreserved(before,after,sha){
 const b=assertTarget(before,sha),a=assertTarget(after,sha);
 requireThat(Object.keys(b).every(k=>a[k]?.type===b[k].type&&(b[k].type==='secret_text'||a[k].value===b[k].value)));
 requireThat(keys.every(k=>a[k]?.type==='secret_text'));
}
