import test from 'node:test';
import assert from 'node:assert/strict';
import {protectedBrowserConfig,protectedBrowserRequest,SITE,API} from './protected-browser-policy.mjs';
const env=()=>({GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/feature/neon-only-cutover',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',KOTA_TEST_EXPECTED_SOURCE_COMMIT:'a'.repeat(40),KOTA_TEST_CONFIRM_WRITES:'true',KOTA_PREPARE_FRESH_TEST_SHOP:'true',KOTA_TEST_SHOP_ID:'11111111-1111-4111-8111-111111111111',KOTA_TEST_MENU_ITEM_ID:'22222222-2222-4222-8222-222222222222',KOTA_TEST_OWNER_SUBJECT:'fixture-owner',KOTA_TEST_ADMIN_SUBJECT:'fixture-admin',KOTA_CF_ACCESS_CLIENT_ID:'fixture-id',KOTA_CF_ACCESS_CLIENT_SECRET:'fixture-secret',KOTA_TEST_OWNER_EMAIL:'owner@example.test',KOTA_TEST_OWNER_PASSWORD:'fixture-password',KOTA_TEST_ADMIN_EMAIL:'admin@example.test',KOTA_TEST_ADMIN_PASSWORD:'fixture-password2'});
test('live browser fails before network or login without exact approved fresh staging scope',()=>{
 assert.equal(protectedBrowserConfig(env()).shopName,'TEST Kota QA 123-1');
 for(const key of Object.keys(env())){const e=env();delete e[key];assert.throws(()=>protectedBrowserConfig(e),key);}
 for(const patch of [{GITHUB_REF:'refs/heads/main'},{GITHUB_SHA:'b'.repeat(40)},{KOTA_TEST_API_BASE:'https://production.example'},{KOTA_PREPARE_FRESH_TEST_SHOP:'false'}])assert.throws(()=>protectedBrowserConfig({...env(),...patch}));
});
test('browser service credentials are restricted to the two private origins and stripped from public SDK/font requests',()=>{
 const e=env(),headers={'CF-Access-Client-Secret':'stale-secret',authorization:'Bearer fixture',cookie:'fixture-cookie'};
 for(const origin of [SITE,API]){const h=protectedBrowserRequest(origin+'/auth/token','GET','fetch',headers,e);assert.equal(h['cf-access-client-secret'],e.KOTA_CF_ACCESS_CLIENT_SECRET);assert.equal(h.authorization,headers.authorization);}
 const publicHeaders=protectedBrowserRequest('https://esm.sh/@neon/auth@latest','GET','script',headers,e);assert.deepEqual(publicHeaders,{});
 for(const [url,method,type] of [['https://esm.sh/exfil','POST','fetch'],['https://esm.sh/exfil','GET','fetch'],['https://other.example/script.js','GET','script'],[SITE+'.evil.example/auth','POST','fetch'],['https://user:pass@kota-connect-neon-staging.pages.dev/','GET','document']])assert.equal(protectedBrowserRequest(url,method,type,headers,e),null);
});
