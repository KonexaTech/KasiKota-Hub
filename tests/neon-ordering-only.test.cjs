const fs = require("node:fs");
const assert = require("node:assert/strict");
const root = "staging-preview/";
const pages = ["index.html","neon-customer.html","neon-owner.html","neon-admin.html","neon-staging.html","neon-app.js","_worker.js"];
for (const file of pages) {
  const source = fs.readFileSync(root + file,"utf8");
  assert(!/firebase(?:app|auth|firestore|messaging)\s*\(|firebase\.initializeApp|firebase\.messaging|from\s*["\x27][^"\x27]*firebase|wa\.me\//i.test(source), file + " must not call Firebase or WhatsApp ordering");
  console.log("PASS Neon-only staging asset:",file);
}
const entry = fs.readFileSync(root + "index.html","utf8");
assert(entry.includes("neon-customer.html"), "Staging entry must open Neon ordering");
const app = fs.readFileSync(root + "neon-app.js","utf8");
for (const route of ["/api/shops","/api/orders","/api/orders/mine","/api/owner/shops","/api/admin/orders"]) {
  assert(app.includes(route), "Missing frontend Neon route: "+route);
}
const api = fs.readFileSync("worker/src/neon-api.js","utf8");
assert(api.includes("verifiedNeonSubject"),"Orders must verify Neon identity");
const worker = fs.readFileSync("worker/src/index.js","utf8");
assert(worker.includes("NEON_ONLY_MODE"),"Neon-only guard required");
assert(!worker.includes("privilegedRoute"),"Legacy Firebase privileged routes must remain disconnected");
console.log("PASS Neon ordering integration static checks");

for (const [path, destination] of Object.entries({
  "index.html":"neon-customer.html",
  "admin-dashboard.html":"neon-admin.html",
  "kota-connect-owners-dashboard-fixed.html":"neon-owner.html",
  "order-tracking.html":"neon-customer.html",
  "neon-customer.html":"neon-customer.html",
  "neon-owner.html":"neon-owner.html",
  "neon-admin.html":"neon-admin.html",
  "neon-staging.html":"neon-customer.html"
})) {
  const source = fs.readFileSync(path,"utf8");
  assert(source.includes("https://kota-connect-neon-staging.pages.dev/"+destination), path+" must use Neon staging");
  assert(!/firebase|firestore|firebaseapp/i.test(source.replace(/Firebase version of this page has been retired/g,"")),path+" still contains Firebase code");
  console.log("PASS retired Firebase entry:",path);
}
