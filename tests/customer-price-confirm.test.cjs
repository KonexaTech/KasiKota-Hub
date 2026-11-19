const fs=require("node:fs");
const assert=require("node:assert/strict");
for(const prefix of ["","staging-preview/"]){
  const html=fs.readFileSync(prefix+"neon-customer.html","utf8");
  const js=fs.readFileSync(prefix+"neon-app.js","utf8");
  assert(html.includes('<select id="area"'),"Area dropdown must remain");
  assert(html.includes('<select id="shop"'),"Shop selector must remain");
  assert(html.includes('id="menuItems"'),"Text-only menu must exist");
  assert(!/<img[\s>]/i.test(html),"No menu pictures in this release");
  assert(html.includes('id="confirmSection" hidden'),"Checkout must start hidden");
  assert(html.includes('id="confirmOrder"'),"Checkout must require confirmation");
  assert(js.includes("price.onclick=()=>"),"Price selection must be clickable");
  assert(js.includes('selectedItem=item'),"Price must select menu item");
  assert(js.includes('$("confirmSection").hidden=false'),"Tapping price must reveal checkout");
  assert(js.includes('$("checkout").onsubmit='),"Only submitted form may place order");
  assert(js.includes('requestId,shopId:$("shop").value'),"Idempotent Neon order payload retained");
  assert(js.includes('Guest "+guestToken()'),"Guest ordering must remain passwordless");
  assert(js.includes('if(role==="owner"){') && js.includes('if(role==="admin"){'),"Owner/admin role handlers retained");
  console.log("PASS text-only price-to-confirm flow:",prefix||"root");
}
