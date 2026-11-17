const fs=require("node:fs"),assert=require("node:assert/strict");
const read=p=>fs.readFileSync(p,"utf8");
const customer=read("index.html"),owner=read("kota-connect-owners-dashboard-fixed.html"),admin=read("admin-dashboard.html"),tracking=read("order-tracking.html");
const checks=[
["customer cart",customer.includes('id="addToCart"')&&customer.includes('id="cartItems"')],
["no WhatsApp checkout",!customer.includes("wa.me")],
["customer Firestore order creation",customer.includes('setDoc(ref,')&&customer.includes('customerUid:guestAuth.currentUser.uid')],
["checkout opens tracking",customer.includes('order-tracking.html?id=')],
["owner scoped live orders",owner.includes('onSnapshot(query(collection(db,"orders"),where("ownerUid","==",uid))')],
["owner notification banner",owner.includes('id="new-order-alert"')],
["owner opt-in browser alerts",owner.includes("Notification.requestPermission()")&&owner.includes("new Notification(")],
["owner status updates",owner.includes('updateDoc(')],
["admin registration",admin.includes('createUserWithEmailAndPassword')],
["admin UID gate",admin.includes('user.uid === ADMIN_UID || approvedAdmin')&&admin.includes('claims.claims.kotaAdmin===true')],
["admin live order monitoring",admin.includes('stopAdminOrders=onSnapshot')],
["tracking document listener",tracking.includes('onSnapshot(doc(db,"orders",id)')],
["tracking customer check",tracking.includes('customerUid!==auth.currentUser?.uid')],
["tracking clears inaccessible order",tracking.includes("function clearTracking()")],
["tracking respects fulfillment type",tracking.includes("visibleSteps=steps.filter")],
["premium styles on all pages",[customer,owner,admin,tracking].every(x=>x.includes('href="premium.css"'))],
["admin valid document start",admin.trimStart().startsWith("<!doctype html>")]
];
let failed=0;for(const [name,ok] of checks){console.log((ok?"PASS":"FAIL")+" "+name);if(!ok)failed++}
assert.equal(failed,0,failed+" static checks failed");
console.log("Static checks passed. Firebase rules, real notifications and device acceptance remain unverified.");
