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

test("customer dashboard buttons link to existing, role-gated owner and admin pages",()=>{
  assert.match(customer,/class="dashboard-link owner-link" href="\.\/neon-owner\.html">Shop Owner Dashboard<\/a>/);
  assert.match(customer,/class="dashboard-link admin-link" href="\.\/neon-admin\.html">Admin Dashboard<\/a>/);
  assert.match(owner,/data-role="owner"/);
  assert.match(admin,/data-role="admin"/);
  assert.match(customer,/id="area"/);
  assert.match(customer,/id="shopSearch"/);
  assert.match(customer,/id="menuItems"/);
});

test("shop registration opens as a modal from customer navigation",()=>{
  assert.match(customer,/id="openShopRegistration"/);
  assert.match(customer,/<dialog id="registerShop"/);
  assert.match(customer,/id="shopRegistrationForm"/);
  assert.match(customer,/id="regOwnerName"/);
  assert.match(customer,/id="regShopName"/);
  assert.match(customer,/id="regEmail"/);
  assert.match(customer,/id="regPassword"/);
  assert.match(customer,/id="closeRegistration"/);
  assert.doesNotMatch(owner,/shopRegistrationForm|registerShop|regOwnerName/);
  assert.doesNotMatch(owner,/id="signup"/,"Owner dashboard must not offer account self-registration");
  assert.doesNotMatch(admin,/id="signup"/,"Admin dashboard must not offer account self-registration");
});
test("owner account must verify email and receive admin approval before dashboard access",()=>{
  const ownerClient=fs.readFileSync("staging-preview/neon-app.js","utf8");
  const registration=fs.readFileSync("staging-preview/kota-shop-registration.mjs","utf8");
  assert.match(ownerClient,/sendVerificationOtp\(\{email,type:"email-verification"\}\)/);
  assert.match(ownerClient,/verifyEmail\(\{email,otp\}\)/);
  assert.match(ownerClient,/\/api\/owner\/access/);
  assert.match(ownerClient,/ownerAccess\?\.approved===true/);
  assert.match(backend,/SELECT 1 FROM kc_shops WHERE owner_subject=\$1 AND approved=true LIMIT 1/);
  assert.match(backend,/Shop owner access is locked until an administrator approves your application/);
  assert.match(backend,/INSERT INTO kc_shops\(owner_subject,name,area,address,phone,approved\)/);
});

test("shop registration is located on the customer page, not the owner dashboard",()=>{
  const registration=fs.readFileSync("staging-preview/kota-shop-registration.mjs","utf8");
  assert.match(customer,/id="openShopRegistration"/);
  assert.match(customer,/src="\.\/kota-shop-registration\.mjs"/);
  assert.ok(registration.includes('fetch("/api/shop-applications",{method:"POST"'));
  assert.match(registration,/await auth\.signOut\(\)/);
  assert.doesNotMatch(owner,/id="shopRegistrationForm"|id="registerShop"/);
});

test("readable notifications appear inside both dashboards, with one-tap read and safe DOM text",()=>{
 const client=fs.readFileSync("staging-preview/neon-app.js","utf8");
 for(const page of [owner,admin]){
   assert.match(page,/id="notificationList"/);
   assert.match(page,/id="notifications"/);
   assert.match(page,/id="markRead"/);
   assert.match(page,/neon-app\.js\?v=20261119-notifications-v1/);
 }
 assert.match(client,/renderNotifications\(notifications\)/);
 assert.match(client,/notification\.title/);
 assert.match(client,/notification\.read_at/);
 assert.match(client,/button\.textContent="Mark as read"/);
 assert.match(client,/body\.textContent=readableNotificationBody\(notification\)/);
 assert.match(client,/aria-busy/);
 assert.match(backend,/LEFT JOIN kc_orders o ON o\.id=n\.order_id/);
 assert.match(backend,/n\.recipient_subject=\$1/);
 assert.match(backend,/New shop application/);
 assert.match(backend,/FROM kc_admins/);
});
