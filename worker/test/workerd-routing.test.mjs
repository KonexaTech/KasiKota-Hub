// Actual local Workers runtime; provider/Access responses are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const entry=`import {cyclingRouteDistance} from './cycling-route.js';
import {deliveryHealth} from './delivery-health.js';
export default {async fetch(request){
 let mode;const redirect=new URL(request.url).searchParams.has('redirect');
 const upstream=async(url,init)=>{const checked=new Request(url,init);mode=checked.redirect;if(redirect)return new Response(null,{status:302,headers:{location:'https://foreign.example'}});return Response.json(String(url).endsWith('/v1/health')?{ok:true,service:'konexa-delivery',sourceCommit:'a'.repeat(40),payments_enabled:false,driver_schema_ready:true,auth_schema_ready:true,status_schema_ready:true}:{routes:[{summary:{distance:1234.2}}]});};
 if(new URL(request.url).pathname==='/health'){
 const result=await deliveryHealth(new Request('https://kota-connect-api-dev.siboniisozulu.workers.dev/api/admin/delivery-health'),{NEON_ONLY_MODE:'true',DELIVERY_SERVICE_URL:'https://konexa-delivery-private-staging.pages.dev',DELIVERY_CF_ACCESS_CLIENT_ID:'fixture-id',DELIVERY_CF_ACCESS_CLIENT_SECRET:'fixture-secret'},upstream);
 return Response.json({status:result.status,result:await result.json(),mode});}
 try{return Response.json({distance:await cyclingRouteDistance({pickup:{lat:-27,lon:30},dropoff:{lat:-27.01,lon:30.01},apiKey:'fixture-key',fetcher:upstream}),mode});}catch{return new Response('unavailable',{status:503});}
}};`;
test('workerd accepts routing and health requests while redirects remain rejected',async()=>{
 const modules=[{type:'ESModule',path:'entry.mjs',contents:entry}];
 for(const name of ['cycling-route.js','delivery-health.js'])modules.push({type:'ESModule',path:name,contents:await readFile(new URL('../src/'+name,import.meta.url),'utf8')});
 const mf=new Miniflare(convertV4MiniflareOptions({modules,compatibilityDate:'2026-11-17',cf:false}));
 try{
  const route=await mf.dispatchFetch('http://localhost/cycle');assert.equal(route.status,200);assert.deepEqual(await route.json(),{distance:1235,mode:'manual'});
  const health=await (await mf.dispatchFetch('http://localhost/health')).json();assert.equal(health.status,200);assert.equal(health.result.ok,true);assert.equal(health.mode,'manual');
  assert.equal((await mf.dispatchFetch('http://localhost/cycle?redirect')).status,503);
  const denied=await (await mf.dispatchFetch('http://localhost/health?redirect')).json();assert.equal(denied.status,503);assert.equal(denied.result.ok,false);
 }finally{await mf.dispose();}
});
