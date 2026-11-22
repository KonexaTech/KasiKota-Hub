const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const api=fs.readFileSync("worker/src/neon-api.js","utf8");
const auth=fs.readFileSync("worker/src/neon-auth.js","utf8");
const worker=fs.readFileSync("worker/src/index.js","utf8");
 fix/kota-connect-full-audit-20261119
const customer=fs.readFileSync("staging-preview/neon-customer.html","utf8");
const customerClient=fs.readFileSync("staging-preview/kota-customer.mjs","utf8");
const owner=fs.readFileSync("staging-preview/neon-owner.html","utf8");
const admin=fs.readFileSync("staging-preview/neon-admin.html","utf8");
const registration=fs.readFileSync("staging-preview/kota-shop-registration.mjs","utf8");
test("Worker routes only to the guarded Neon development database",()=>{
 assert.match(worker,/NEON_ONLY_MODE !== "true"/);
 assert.match(worker,/EXPECTED_NEON_HOST/);
 assert.match(worker,/await neonApi\(request, env, withDb\)/);
 assert.doesNotMatch(worker,/privilegedRoute|verifiedFirebaseUser|FIREBASE_PROJECT_ID|ADMIN_UID/);
});
test("Neon Auth verifies signed EdDSA JWTs with JWKS and issuer, without an unsupported audience requirement",()=>{
 assert.match(auth,/jwtVerify\(/);
 assert.match(auth,/algorithms: \["EdDSA"\]/);
 assert.match(auth,/NEON_AUTH_JWKS_URL/);
 assert.match(auth,/issuer/);
 assert.doesNotMatch(auth,/audience\s*:/);
 assert.match(auth,/createRemoteJWKSet/);
});
test("Every signed account must be email-verified and not actively banned",()=>{

const page=fs.readFileSync("neon-staging.html","utf8");
test("Worker routes only to Neon and fails closed without Neon-only mode",()=>{assert.match(worker,/NEON_ONLY_MODE !== "true"/);assert.match(worker,/await neonApi\(request, env, withDb\)/);assert.doesNotMatch(worker,/privilegedRoute|verifiedFirebaseUser|FIREBASE_PROJECT_ID|ADMIN_UID/)});
test("Neon Auth validates signed tokens with configured JWKS and issuer",()=>{assert.match(auth,/jwtVerify\(/);assert.match(auth,/algorithms: \["EdDSA"\]/);assert.match(auth,/NEON_AUTH_JWKS_URL/);assert.match(auth,/issuer/);assert.match(auth,/const issuer = new URL\(base\)\.origin;/);assert.match(auth,/jwtVerify\(token, jwks, \{ algorithms: \["EdDSA"\], issuer \}\)/);assert.doesNotMatch(auth,/audience:\s*issuer/);assert.match(auth,/createRemoteJWKSet/)});
test("Admin role comes from database, not browser request",()=>{assert.match(auth,/FROM kc_admins WHERE subject=\$1/);assert.match(api,/isNeonAdmin\(/)});
test("Order prices are calculated using Neon menu rows",()=>{assert.match(api,/SELECT id,name,price_cents FROM kc_menu_items/);assert.match(api,/subtotal\+=prices\.get\(item\.itemId\)\.price_cents\*item\.quantity/)});
test("Order status updates require shop ownership and lock row",()=>{assert.match(api,/s\.owner_subject=\$2 FOR UPDATE OF o/);assert.match(api,/Invalid status transition/)});
test("Order and history reads verify customer, owner or admin",()=>{assert.match(api,/order\.customer_subject!==subject&&order\.owner_subject!==subject/);assert.match(api,/\/history/);assert.match(api,/actor_role,note,created_at/)});
test("Notifications are scoped to authenticated recipient",()=>{assert.match(api,/WHERE (?:n\.)?recipient_subject=\$1/);assert.match(api,/read_at=COALESCE\(read_at,now\(\)\)/)});
test("Shop approval is database-admin-gated",()=>{assert.match(api,/path==="\/api\/admin\/shop-applications"/);assert.match(api,/application\.status!=="pending"/)});
test("Staging page has no Firebase SDK dependency",()=>{assert.doesNotMatch(page,/https?:[^"\s]+firebase[^"\s]+\.js|from\s+["\x27][^"\x27]*firebase/i);assert.match(page,/createAuthClient/)});
test("Order line items require ownership and use snapshot prices",()=>{assert.match(api,/const details=\/\^/);assert.match(api,/order\.customer_subject!==subject&&order\.owner_subject!==subject/);assert.match(api,/SELECT item_name,unit_price_cents,quantity FROM kc_order_items/)});
test("Checkout requires a stable request ID and enforces a unique retry key",()=>{assert.match(api,/uuid\.test\(data\.requestId/);assert.match(api,/ON CONFLICT \(customer_subject,client_request_id\)/);assert.match(api,/replayed:true/);assert.match(page,/crypto\.randomUUID\(\)/)});
test("All three Neon role pages use shared Firebase-free client",()=>{for(const role of ["customer","owner","admin"]){const html=fs.readFileSync("neon-"+role+".html","utf8");assert.match(html,/src="\.\/neon-app\.js(?:\?[^"]*)?"/);assert.doesNotMatch(html,/firebase(?:-app|-auth|-firestore)\.js/i)}const client=fs.readFileSync("neon-app.js","utf8");assert.match(client,/crypto\.randomUUID\(\)/);assert.match(client,/\/api\/notifications/);assert.match(client,/\/api\/orders/);assert.doesNotMatch(client,/firebaseapp\.com|firebase\/auth|firebase\/firestore/i)});
test("Replayed checkout key cannot silently change items or delivery",()=>{assert.match(api,/lines\.length===data\.items\.length/);assert.match(api,/lines\.some\(y=>y\.id===x\.itemId&&y\.quantity===x\.quantity\)/);assert.match(api,/existing\.delivery_address/);assert.match(api,/replay\.delivery_address/)});

test("Development Worker pins Neon database target and reports mismatch safely",()=>{const config=fs.readFileSync("worker/wrangler.jsonc","utf8");assert.match(worker,/EXPECTED_NEON_HOST/);assert.match(worker,/Database target does not match development branch/);assert.match(config,/ep-lively-leaf-za5rtfhs\.c-2\.eu-west-2\.aws\.neon\.tech/);assert.match(api,/wrong_database_target/);assert.doesNotMatch(worker,/console\.log\(.*DATABASE_URL/)});

const stagingApi=fs.readFileSync("staging-preview/neon-app.js","utf8");
const stagingOwner=fs.readFileSync("staging-preview/neon-owner.html","utf8");
const stagingAdmin=fs.readFileSync("staging-preview/neon-admin.html","utf8");
test("Authenticated Neon users must verify email and must not be actively banned",()=>{
 feature/neon-only-cutover
 assert.match(api,/emailVerified/);
 assert.match(api,/Email verification required/);
 assert.match(api,/banExpires/);
 assert.match(api,/Account is suspended/);
});
 fix/kota-connect-full-audit-20261119
test("Admin role comes from the database, never a browser-supplied role",()=>{
 assert.match(auth,/FROM kc_admins WHERE subject=\$1/);
 assert.match(api,/isNeonAdmin\(/);
});
test("Owner access requires an approved shop and administrator accounts cannot use owner routes",()=>{
 assert.match(api,/SELECT 1 FROM kc_shops WHERE owner_subject=\$1 AND approved=true LIMIT 1/);
 assert.match(api,/Administrator accounts cannot use shop-owner functions/);
});
test("Order prices come from the current Neon menu rows and delivery is R5",()=>{
 assert.match(api,/SELECT id,name,price_cents FROM kc_menu_items/);
 assert.match(api,/subtotal\+=prices\.get\(item\.itemId\)\.price_cents\*item\.quantity/);
 assert.match(api,/const delivery=data\.fulfillmentType==="delivery"\?500:0/);
});
test("Staging checkouts are flagged as test orders and duplicate retries are idempotent",()=>{
 assert.match(api,/test_order,client_request_id/);
 assert.match(api,/url\.hostname==="kota-connect-api-dev\.siboniisozulu\.workers\.dev"/);
 assert.match(api,/ON CONFLICT \(customer_subject,client_request_id\)/);
 assert.match(api,/replayed:true/);
});
test("Order status updates require shop ownership and lock the order row",()=>{
 assert.match(api,/s\.owner_subject=\$2 FOR UPDATE OF o/);
 assert.match(api,/Invalid status transition/);
});
test("Order, line-item and history reads verify customer, owner or admin access",()=>{
 assert.match(api,/order\.customer_subject!==subject&&order\.owner_subject!==subject/);
 assert.match(api,/\/history/);
 assert.match(api,/actor_role,note,created_at/);
});
test("Notifications are scoped to the authenticated recipient",()=>{
 assert.match(api,/WHERE recipient_subject=\$1/);
 assert.match(api,/read_at=COALESCE\(read_at,now\(\)\)/);
});
test("Shop approval is database-admin-gated and only pending applications can be reviewed",()=>{
 assert.match(api,/path==="\/api\/admin\/shop-applications"/);
 assert.match(api,/application\.status!=="pending"/);
 assert.match(api,/INSERT INTO kc_shops\(owner_subject,name,area,address,phone,approved\)/);
});
test("Launch commission is paused and no completed-order estimate is generated",()=>{

test("Development Worker flags every newly created order as a test order",()=>{
 assert.match(api,/const testOrder=url\.hostname==="kota-connect-api-dev\.siboniisozulu\.workers\.dev"/);
 assert.match(api,/test_order,client_request_id/);
});
test("Launch commission is paused rather than estimated or collected",()=>{
 feature/neon-only-cutover
 assert.match(api,/commissionPaused:true/);
 assert.match(api,/estimatedCommissionCents:0/);
 assert.match(api,/Commission is paused for launch/);
 assert.doesNotMatch(api,/eligibleCompletedOrders:completed|estimatedCommissionCents:completed\*50/);
});
 fix/kota-connect-full-audit-20261119
test("Customer page remains guest-only, text-menu and cash-only",()=>{
 assert.match(customer,/id="area"/);
 assert.match(customer,/id="shopSearch"/);
 assert.match(customer,/id="menuItems"/);
 assert.doesNotMatch(customer,/id="signin"|id="password"|id="signup"/);
 assert.doesNotMatch(customer,/<img[\s>]/i);
 assert.match(customerClient,/authorization="Guest "\+token\(\)/);
 assert.match(customerClient,/paymentMethod/);
});
test("Shop registration uses a customer-page modal and verifies email before submitting",()=>{
 assert.match(customer,/id="openShopRegistration"/);
 assert.match(customer,/id="registerShop"/);
 assert.match(registration,/sendVerificationOtp/);
 assert.match(registration,/verifyEmail/);
 assert.match(registration,/\/api\/shop-applications/);
 assert.match(registration,/await auth\.signOut\(\)/);
 assert.doesNotMatch(owner,/shopRegistrationForm|registerShop|regOwnerName|id="signup"/);
 assert.doesNotMatch(admin,/id="signup"/);
});
test("All customer/owner/admin staging pages are free of Firebase SDK imports",()=>{
 for(const source of [customer,owner,admin,fs.readFileSync("staging-preview/neon-app.js","utf8")])
  assert.doesNotMatch(source,/firebaseapp\.com|firebase\/auth|firebase\/firestore|firebase-app\.js|firebase-auth\.js/i);

test("Owner and administrator dashboards are login-only and show email verification",()=>{
 assert.doesNotMatch(stagingOwner,/id="signup"/);
 assert.doesNotMatch(stagingAdmin,/id="signup"/);
 assert.match(stagingApi,/emailVerified===false/);
 assert.match(stagingApi,/verifyEmail\(\{email,otp\}\)/);
 assert.match(stagingApi,/loadOwnerOrders\(false\)\.catch/);
 feature/neon-only-cutover
});
