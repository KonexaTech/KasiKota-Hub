const fs=require("node:fs"),assert=require("node:assert/strict");
const read=p=>fs.readFileSync(p,"utf8");
for(const [page,target] of Object.entries({"index.html":"neon-customer.html","admin-dashboard.html":"neon-admin.html","kota-connect-owners-dashboard-fixed.html":"neon-owner.html","order-tracking.html":"neon-customer.html"})){
  const source=read(page);
  assert(source.includes(target),page+" must route to Neon");
  assert(!/firebase(?:\.initializeApp|\.auth|\.firestore|\.messaging)|firestore\.collection|gstatic\.com\/firebasejs/i.test(source),page+" must not initialize Firebase");
  console.log("PASS Neon entry "+page);
}
const api=read("worker/src/neon-api.js");
assert(api.includes("verifiedNeonSubject"),"Neon authenticated orders required");
assert(api.includes("/api/orders"),"Neon orders API required");
const worker=read("worker/src/index.js");
assert(worker.includes("NEON_ONLY_MODE"),"Neon-only deployment guard required");
assert(!worker.includes("privilegedRoute"),"Firebase privileged routing must not be mounted");
assert(!read("firebase-messaging-sw.js").includes("firebase.initializeApp"),"Firebase push must be retired");
console.log("PASS Neon-only ordering static checks; live migration and push remain separate gates");

// Runtime behavior is covered by worker/test/checkout-validation.test.mjs.
// Legacy Firebase page assertions do not describe the Neon entry points.
