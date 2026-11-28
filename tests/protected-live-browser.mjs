// Manual, source-matched staging only. Never print credentials, tokens, DOM data or screenshots.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {protectedBrowserConfig,protectedBrowserRequest,SITE,API} from './protected-browser-policy.mjs';
import {stagingAccessFetch} from '../worker/test/staging-access-fetch.mjs';
import {assertCandidateHealth} from '../worker/test/live-acceptance-guard.mjs';
let stage='scope',browser;
try{
 const env=process.env,c=protectedBrowserConfig(env),request=stagingAccessFetch(env);
 stage='deployed-source';const health=await request(API+'/api/health');assert.equal(health.status,200);assertCandidateHealth(c,await health.json());
 const marker=await request(SITE+'/qa-source.json');assert.equal(marker.status,200);assert.equal((await marker.json()).sourceCommit,c.sourceCommit);
 const capabilities=await request(API+'/api/delivery-capabilities');assert.equal(capabilities.status,200);const deliveryAvailable=(await capabilities.json()).delivery_available;assert.equal(typeof deliveryAvailable,'boolean');
 const shopData=await request(API+'/api/shops'),shops=(await shopData.json()).shops;
 const shop=shops?.find(row=>row.id===c.shopId);assert.equal(shop?.name,c.shopName);
 const menuData=await request(API+'/api/shops/'+c.shopId+'/menu'),item=(await menuData.json()).items?.find(row=>row.id===c.menuItemId);
 assert(item&&Number.isSafeInteger(item.price_cents)&&item.price_cents>=0);
 browser=await chromium.launch({headless:true,executablePath:env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 const pageErrors=[];
 async function page(){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/*',async route=>{
   const r=route.request(),headers=protectedBrowserRequest(r.url(),r.method(),r.resourceType(),r.headers(),env);
   if(!headers)return route.abort('blockedbyclient');await route.continue({headers});
  });
  const p=await context.newPage();p.on('pageerror',()=>pageErrors.push(true));p.setDefaultTimeout(45000);return p;
 }
 async function identity(p,path){return p.evaluate(async path=>{
  const tokenResponse=await fetch('/auth/token',{cache:'no-store',credentials:'include'}),data=await tokenResponse.json();
  const token=data.token??data.data?.token;if(!token)throw Error('signed token unavailable');
  const response=await fetch(path,{headers:{authorization:'Bearer '+token},cache:'no-store'});
  return {status:response.status,data:response.status===200?await response.json():null};
 },path);}
 async function login(role){
  stage=role+'-screen';const p=await page();await p.goto(SITE+'/neon-'+role+'.html',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForFunction(()=>document.getElementById('identity')?.textContent==='Not signed in');
  await p.locator('#email').fill(env[role==='owner'?'KOTA_TEST_OWNER_EMAIL':'KOTA_TEST_ADMIN_EMAIL']);
  if(role==='owner'){
   stage='wrong-password';await p.locator('#password').fill('TEST-ONLY-INVALID-PASSWORD');
   const denied=p.waitForResponse(r=>new URL(r.url()).origin===SITE&&new URL(r.url()).pathname==='/auth/sign-in/email'&&r.request().method()==='POST');
   await p.locator('#signin button').click();assert.equal((await denied).status(),401);
   await p.waitForFunction(()=>!document.querySelector('#signin button').disabled);
   assert.equal(await p.locator('[data-restricted-panel]:visible').count(),0);
  }
  stage=role+'-sign-in';await p.locator('#password').fill(env[role==='owner'?'KOTA_TEST_OWNER_PASSWORD':'KOTA_TEST_ADMIN_PASSWORD']);await p.locator('#signin button').click();
  await p.waitForFunction(()=>document.getElementById('signin')?.hidden===true&&[...document.querySelectorAll('[data-restricted-panel]')].some(p=>!p.hidden));
  assert.equal(await p.locator('#password').inputValue(),'');
  const me=await identity(p,'/api/me');assert.equal(me.status,200);assert.equal(me.data.admin,role==='admin');assert.equal(me.data.subject,role==='admin'?c.adminSubject:c.ownerSubject);
  const denied=await identity(p,role==='owner'?'/api/admin/orders':'/api/owner/orders');assert.equal(denied.status,403);
  return p;
 }
 const owner=await login('owner');stage='guest-customer';const guest=await page();await guest.goto(SITE+'/neon-customer.html',{waitUntil:'domcontentloaded',timeout:60000});
 assert.equal(await guest.locator('#signin').count(),0);await guest.locator('#proceed').click();await guest.locator('#area').selectOption('all');await guest.locator('#shopSearch').fill(c.shopName);
 stage='guest-discovery';const selectedShop=guest.locator('#shopResults .shop-card').filter({hasText:c.shopName}).locator('button');await selectedShop.waitFor();assert.equal(await selectedShop.count(),1);await selectedShop.click();
 stage='guest-menu';await guest.waitForFunction(available=>document.querySelector('#fulfillment option[value="delivery"]')?.disabled===!available,deliveryAvailable);
 const price='R'+(item.price_cents/100).toFixed(2);await guest.getByRole('button',{name:'Choose '+item.name+' for '+price,exact:true}).click();
 await guest.locator('#fulfillment').selectOption('pickup');await guest.locator('#quantity').fill('1');await guest.locator('#customerName').fill('TEST Browser '+env.GITHUB_RUN_ID);await guest.locator('#customerPhone').fill('0000000000');
 stage='guest-checkout';const submitted=guest.waitForResponse(r=>new URL(r.url()).origin===SITE&&new URL(r.url()).pathname==='/api/orders'&&r.request().method()==='POST');await guest.locator('#confirmOrder').click();const response=await submitted;assert.equal(response.status(),201);
 const order=(await response.json()).order;assert.equal(order.total_cents,item.price_cents);assert.match(order.id,/^[a-f0-9-]{36}$/i);
 await guest.waitForFunction(id=>document.getElementById('orderId')?.value===id,order.id);
 stage='owner-order-load';await owner.locator('#openCustomerOrders').click();
 await owner.waitForFunction(id=>[...document.querySelectorAll('#ownerOrderSelect option')].some(option=>option.value===id),order.id);
 await owner.locator('#ownerOrderSelect').selectOption(order.id);
 for(const status of ['accepted','preparing','ready_for_collection','completed']){
  stage='owner-status-'+status;
  await owner.waitForFunction(()=>!document.getElementById('updateStatus')?.hasAttribute('aria-busy'));
  await owner.locator('#status').selectOption(status);
  const saved=owner.waitForResponse(r=>new URL(r.url()).origin===SITE&&new URL(r.url()).pathname==='/api/owner/orders/'+order.id+'/status'&&r.request().method()==='PATCH');
  await owner.locator('#updateStatus').click();assert.equal((await saved).status(),200);
  await owner.waitForFunction(s=>document.getElementById('currentOrderStatus')?.textContent.includes('Current saved status: '+s.replaceAll('_',' ')),status);
  await owner.waitForFunction(()=>!document.getElementById('updateStatus')?.hasAttribute('aria-busy'));
 }
 stage='guest-refresh-persistence';await guest.reload({waitUntil:'domcontentloaded'});assert.equal(await guest.locator('#orderId').inputValue(),order.id);await guest.locator('#track').click();await guest.waitForFunction(()=>document.getElementById('trackingStatus')?.textContent.includes('completed'));
 const admin=await login('admin');stage='admin-order-oversight';await admin.locator('#openCustomerOrders').click();await admin.waitForFunction(number=>document.getElementById('adminOrderList')?.textContent.includes(number),order.order_number);
 stage='logout';for(const p of [owner,admin]){if(await p.locator('#customerOrdersDialog').isVisible())await p.locator('#closeCustomerOrders').click();await p.locator('#signout').click();await p.waitForFunction(()=>document.getElementById('signin')?.hidden===false&&[...document.querySelectorAll('[data-restricted-panel]')].every(p=>p.hidden));assert.equal(await p.locator('#password').inputValue(),'');}
 assert.equal(pageErrors.length,0);
 console.log('PASS: LIVE_BROWSER private 390px guest checkout/reload, owner pickup lifecycle, real owner/admin sign-in, wrong-password rejection, role isolation, admin oversight and logout; TEST fixture only, no physical-device evidence.');
}catch{console.error('FAIL: protected live browser at '+stage+'. No credentials, tokens, page data or screenshots logged.');process.exitCode=1;}
finally{await browser?.close();}
