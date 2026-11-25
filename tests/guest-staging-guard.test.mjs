import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {approvedGuestTestConfig,assertGuestTestHealth,approvedGuestTestShop,approvedGuestTestMenuItem,KOTA_QA_API} from './guest-staging-guard.mjs';
const env=()=>({
  KOTA_GUEST_TEST_CONFIRM_WRITES:'true',
  KOTA_GUEST_TEST_SHOP_ID:'11111111-1111-4111-8111-111111111111',
  KOTA_GUEST_TEST_MENU_ITEM_ID:'22222222-2222-4222-8222-222222222222',
  KOTA_GUEST_TEST_SOURCE_COMMIT:'a'.repeat(40),
  KOTA_GUEST_TEST_API_BASE:KOTA_QA_API
});
test('guest order test is disabled by default and rejects other targets and missing source identity',()=>{
  const base=env();
  for(const key of Object.keys(base)) {
    if(key==='KOTA_GUEST_TEST_API_BASE')continue;
    const altered={...base};delete altered[key];
    assert.throws(()=>approvedGuestTestConfig(altered),/BLOCKED/);
  }
  for(const target of ['https://example.org','https://kota-connect-api-dev.siboniisozulu.workers.dev/other','https://user:pass@kota-connect-api-dev.siboniisozulu.workers.dev','http://kota-connect-api-dev.siboniisozulu.workers.dev']) assert.throws(()=>approvedGuestTestConfig({...base,KOTA_GUEST_TEST_API_BASE:target}),/BLOCKED/);
  assert.throws(()=>approvedGuestTestConfig({...base,KOTA_GUEST_TEST_SOURCE_COMMIT:'0'.repeat(40)}),/BLOCKED/);
  assert.throws(()=>approvedGuestTestConfig({...base,KOTA_GUEST_TEST_SHOP_ID:'not-a-uuid'}),/BLOCKED/);
  assert.throws(()=>approvedGuestTestConfig({...base,KOTA_GUEST_TEST_CONFIRM_WRITES:'false'}),/BLOCKED/);
});
test('live health must exactly match a reviewed source commit before order creation',()=>{
  const c=approvedGuestTestConfig(env());
  for(const h of [{ok:true,backend:'neon'},{ok:true,backend:'neon',sourceCommit:'b'.repeat(40)},{ok:true,backend:'other',sourceCommit:c.sourceCommit},{ok:false,backend:'neon',sourceCommit:c.sourceCommit}]) assert.throws(()=>assertGuestTestHealth(c,h),/BLOCKED/);
  assert.doesNotThrow(()=>assertGuestTestHealth(c,{ok:true,backend:'neon',sourceCommit:c.sourceCommit}));
});
test('only exact TEST merchant and exact TEST menu are eligible',()=>{
  const c=approvedGuestTestConfig(env());
  const real={id:c.shopId,name:'Actual customer shop',approved:true};
  const fixture={id:c.shopId,name:'TEST Kota QA 42',approved:true};
  assert.throws(()=>approvedGuestTestShop(c,[real]),/BLOCKED/);
  assert.throws(()=>approvedGuestTestShop(c,[{...fixture,id:'33333333-3333-4333-8333-333333333333'}]),/BLOCKED/);
  assert.deepEqual(approvedGuestTestShop(c,[real,{...fixture,id:c.shopId}]),fixture);
  const menu={id:c.menuItemId,name:'TEST Kota Item',available:true,price_cents:100};
  for(const item of [{...menu,name:'Real Kota'}, {...menu,id:c.shopId}, {...menu,price_cents:'100'}, {...menu,available:false}]) assert.throws(()=>approvedGuestTestMenuItem(c,[item]),/BLOCKED/);
  assert.deepEqual(approvedGuestTestMenuItem(c,[menu]),menu);
});
test('the exact pre-existing staging fixture labels remain eligible without broadening UUID scope',()=>{
  const c=approvedGuestTestConfig(env());
  const stagingShop={id:c.shopId,name:'Kota Connect Staging Test Kitchen',approved:true};
  const stagingItem={id:c.menuItemId,name:'Classic Kota (TEST)',available:true,price_cents:4500};
  assert.deepEqual(approvedGuestTestShop(c,[stagingShop]),stagingShop);
  assert.deepEqual(approvedGuestTestMenuItem(c,[stagingItem]),stagingItem);
  assert.throws(()=>approvedGuestTestShop(c,[{...stagingShop,id:'33333333-3333-4333-8333-333333333333'}]),/BLOCKED/);
  assert.throws(()=>approvedGuestTestMenuItem(c,[{...stagingItem,id:'33333333-3333-4333-8333-333333333333'}]),/BLOCKED/);
});
test('live guest probe must scope shop/item and health before any POST',()=>{
  const source=readFileSync('tests/verify-live-guest-order.mjs','utf8');
  assert.match(source,/approvedGuestTestConfig\(process\.env\)/);
  assert.match(source,/assertGuestTestHealth\(config,/);
  assert.match(source,/approvedGuestTestShop\(config,/);
  assert.match(source,/approvedGuestTestMenuItem\(config,/);
  assert.doesNotMatch(source,/menu\.body\.items\[0\]|orderedShops|for\s*\(const shop of orderedShops\)/);
  assert.ok(source.indexOf('approvedGuestTestConfig(process.env)')<source.indexOf('await request('));
});
