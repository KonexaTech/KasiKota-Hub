// Actual Chromium DOM, synthetic proof responses only. No private staging or device claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
test('merchant/guest proof controls clear codes on selection, account and visibility changes; late responses stay private',async()=>{
 const module=await readFile('staging-preview/delivery-proof-control.mjs','utf8');
 const html='<!doctype html><input id="order" value="test-order"><p id="anchor"></p><script type="module">import {mountDeliveryProof} from "/control.mjs";window.pending=null;window.control=mountDeliveryProof({after:document.querySelector("#anchor"),label:"Show handover code",purpose:"handover",currentOrder:()=>document.querySelector("#order").value,request:()=>new Promise(r=>window.pending=r)});window.control.update("test-order",true);</script>';
 const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/control.mjs'?'application/javascript':'text/html');res.end(req.url==='/control.mjs'?module:html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto('http://127.0.0.1:'+server.address().port);
  const button=page.getByRole('button',{name:'Show handover code'}),status=page.getByRole('status');
  await button.click();await page.evaluate(()=>window.pending({pin:'012345',purpose:'handover',expires_in:900}));await status.filter({hasText:'012345'}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
  await page.evaluate(()=>window.dispatchEvent(new Event('storage')));assert.equal(await status.textContent(),'');
  await button.click();
  await page.evaluate(()=>{document.querySelector('#order').value='other-order';window.control.update('other-order',true);window.pending({pin:'654321',purpose:'handover',expires_in:900});});
  await page.waitForTimeout(20);assert.equal(await status.textContent(),'');
  await button.click();await page.evaluate(()=>{window.control.update('',false);window.pending({pin:'111111',purpose:'handover',expires_in:900});});
  await page.waitForTimeout(20);assert.equal(await status.textContent(),'');assert.equal(await button.isHidden(),true);
  await page.evaluate(()=>{document.querySelector('#order').value='test-order';window.control.update('test-order',true);});
  await button.click();await page.evaluate(()=>window.pending({pin:'222222',purpose:'handover',expires_in:900}));await status.filter({hasText:'222222'}).waitFor();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await status.textContent(),'');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
