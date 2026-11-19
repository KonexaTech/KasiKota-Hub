const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const customer=fs.readFileSync("staging-preview/neon-customer.html","utf8");
const client=fs.readFileSync("staging-preview/kota-customer.mjs","utf8");
const admin=fs.readFileSync("staging-preview/neon-admin.html","utf8");
const owner=fs.readFileSync("staging-preview/neon-owner.html","utf8");
const backend=fs.readFileSync("worker/src/neon-api.js","utf8");
test("welcome leads to area and shop-name search, tap-price confirm and track",()=>{
  for(const id of ["welcome","proceed","area","shopSearch","shopResults","menuItems","confirmStep","trackStep","track"])assert.match(customer,new RegExp('id="'+id+'"'));
  assert.match(client,/button\.textContent=money\(item\.price_cents\)/);
  assert.match(client,/\/api|\"\/orders\"/);
  assert.doesNotMatch(customer,/id="signin"|id="password"|id="signup"/);
});
test("online payment cannot be selected until provider verifies payments",()=>{
  assert.match(customer,/<option value="online" disabled>/);
  assert.match(client,/if\(\$\("paymentMethod"\)\.value!=="cash"\)/);
  assert.match(customer,/No online payment will be taken/);
});
test("owner details only update the authenticated shop owner and do not edit approval flags",()=>{
  assert.match(owner,/id="saveShopDetails"/);
  assert.match(backend,/UPDATE kc_shops SET name=\$3,area=\$4,phone=\$5,address=\$6 WHERE id=\$1 AND owner_subject=\$2/);
  assert.match(backend,/if\(isOwnerOnlyRoute\(path\)&&await isNeonAdmin/);
});
test("admin overview verifies database role and never invents collected commission",()=>{
  assert.match(admin,/id="registeredShops"/);
  assert.match(admin,/id="commissionCollected"/);
  assert.match(backend,/path==="\/api\/admin\/overview"/);
  assert.match(backend,/collectedCommissionCents:null/);
});
