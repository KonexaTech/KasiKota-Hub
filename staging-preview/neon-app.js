import { createAuthClient } from "https://esm.sh/@neon/auth@latest";
const AUTH_URL=new URL("/auth",location.origin).href;
const auth=createAuthClient(AUTH_URL);
const $=id=>document.getElementById(id), role=document.body.dataset.role;
const API="https://kota-connect-api-dev.siboniisozulu.workers.dev";
let requestId=null,menu=[],cart=[];
let dashboardAccess=false;
const guestStorageKey="kota_connect_guest_checkout_v1";
function guestToken(){
  // A random private identity for guest orders. Never log or display this value.
  let token;
  try { token=localStorage.getItem(guestStorageKey); } catch { throw Error("Browser storage must be enabled to track guest orders"); }
  if(!/^[a-f0-9]{64}$/.test(token||"")){
    const secret=crypto.getRandomValues(new Uint8Array(32));
    token=Array.from(secret,value=>value.toString(16).padStart(2,"0")).join("");
    try { localStorage.setItem(guestStorageKey,token); } catch { throw Error("Browser storage must be enabled to track guest orders"); }
  }
  return token;
}
function showDashboardPanels(allowed){dashboardAccess=Boolean(allowed);document.querySelectorAll('[data-restricted-panel]').forEach(panel=>{panel.hidden=!dashboardAccess})}
const out=(message)=>{$("result").textContent=typeof message==="string"?message:JSON.stringify(message,null,2)};
const safe=(fn)=>async()=>{try{await fn()}catch(e){out("Error: "+e.message)}};
function isSignedJwt(value){
  return typeof value==="string" && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}
async function apiJwt(){
  // Avoid a known SDK path that can return cached session data in place of a JWT.
  const tokenUrl=(AUTH_URL.endsWith("/")?AUTH_URL.slice(0,-1):AUTH_URL)+"/token";
  let response;
  try{
    response=await fetch(tokenUrl,{
      method:"GET",credentials:"include",cache:"no-store",
      headers:{"accept":"application/json"}
    });
  }catch{
    throw Error("Neon JWT endpoint could not be reached");
  }
  let result;
  try{result=await response.json()}catch{
    throw Error("Neon JWT endpoint returned an invalid response (HTTP "+response.status+")");
  }
  const token=result?.token??result?.data?.token;
  if(response.ok&&isSignedJwt(token))return token;
  const state=!response.ok
    ? "HTTP "+response.status
    : "HTTP "+response.status+" without a signed JWT";
  const reason=typeof result?.error?.message==="string"?result.error.message:
    typeof result?.message==="string"?result.message:null;
  // Never print the session cookie or a returned token in diagnostic output.
  throw Error("Neon JWT endpoint failed ("+state+")"+(reason?": "+reason:""));
}
async function api(path,method="GET",body,publicRoute=false){const headers={"content-type":"application/json"};if(!publicRoute){headers.authorization=role==="customer"?"Guest "+guestToken():"Bearer "+await apiJwt()}const response=await fetch(API+path,{method,headers,body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw Error(data.error||"Request failed");return data}
function option(select,items,label){select.replaceChildren(new Option("Select",""),...items.map(x=>new Option(label(x),x.id)))}
async function showIdentity(){
  showDashboardPanels(false);
  if(role==="customer"){showDashboardPanels(true);$("identity").textContent="No customer account needed. Keep this browser to track your orders.";return}
  const r=await auth.getSession();
  if(r.error)throw Error(r.error.message);
  if(!r.data?.user){$("identity").textContent="Not signed in";return}
  if(role!=="owner"&&role!=="admin"){showDashboardPanels(true);$("identity").textContent=r.data.user.email;return}
  try{
    const me=await api("/api/me");
    const allowed=role==="admin"?me.admin===true:me.admin===false;
    showDashboardPanels(allowed);
    $("identity").textContent=allowed?r.data.user.email:(role==="owner"?"Owner access denied: an administrator account is signed in. Sign out and use a different shop-owner email.":"Administrator access denied: this account is not an approved administrator.");
  }catch(e){
    $("identity").textContent="Unable to verify "+role+" access. Try signing in again.";
    throw e;
  }
}
if(role!=="customer"){
$("signin").addEventListener("submit",e=>{e.preventDefault();safe(async()=>{const r=await auth.signIn.email({email:$("email").value,password:$("password").value});if(r.error)throw Error(r.error.message);if(!r.data)throw Error("Sign-in did not return an account");await showIdentity();if(role==="owner"&&!dashboardAccess)throw Error("Administrator accounts cannot sign in as shop owners. Sign out and use another owner account.");if(role==="admin"&&!dashboardAccess)throw Error("This account is not authorized as an administrator.");out(role==="admin"?"Signed in. Administrator access verified.":"Signed in")})()});
bind("sendVerification",async()=>{const email=$("email").value.trim();if(!email)throw Error("Enter your email address first");const r=await auth.emailOtp.sendVerificationOtp({email,type:"email-verification"});if(r.error)throw Error(r.error.message);out("Verification code requested. Check your inbox and spam folder.")});
bind("verifyEmail",async()=>{const email=$("email").value.trim(),otp=$("verificationCode").value.trim();if(!email||!otp)throw Error("Enter your email and verification code");const r=await auth.emailOtp.verifyEmail({email,otp});if(r.error)throw Error(r.error.message);out("Email verified. You can sign in with your password. Use Reset password only if you need to change it.")});
bind("forgotPassword",async()=>{const email=$("email").value.trim();if(!email)throw Error("Enter your email address first");const r=await auth.requestPasswordReset({email,redirectTo:new URL("./neon-reset-password.html",location.href).href});if(r.error)throw Error(r.error.message);out("If this account exists, a recovery email has been sent. Check inbox and spam. The link expires after one hour.")});
$("signup").onclick=safe(async()=>{const email=$("email").value;const r=await auth.signUp.email({email,password:$("password").value,name:email.split("@")[0]});if(r.error)throw Error(r.error.message);await showIdentity();out(role==="owner"?"Account created. Send a verification code and verify your email before signing in or applying for a shop.":"Account created")});
$("signout").onclick=safe(async()=>{await auth.signOut();await showIdentity();out("Signed out")});
}
function bind(id,fn){const el=$(id);if(el)el.onclick=safe(fn)}
if(role==="customer"){
let shops=[],selectedItem=null,menuShop="";
const money=cents=>"R"+(Number(cents)/100).toFixed(2);
const areaKey=value=>{
  const text=String(value||"").toLowerCase();
  const section=text.match(/section\s*([1-7])/);
  if(section)return "madadeni-"+section[1];
  if(text.includes("osizweni"))return "osizweni";
  if(text.includes("cbd")||text.includes("central"))return "newcastle-cbd";
  if(text.includes("newcastle"))return "newcastle-other";
  return text.replace(/[^a-z0-9]/g,"");
};
function clearChoice(){
  selectedItem=null;requestId=null;cart=[];
  $("menuSection").hidden=true;$("confirmSection").hidden=true;
  $("menuItems").replaceChildren();$("quantity").value="1";
}
function showShops(){
  const area=$("area").value;
  option($("shop"),shops.filter(s=>area&&areaKey(s.area)===areaKey(area)),s=>s.name);
  $("shop").disabled=$("shop").options.length===1;
  menuShop="";clearChoice();
  $("shopMessage").textContent=!area?"Choose your area.":$("shop").disabled?"No approved shops in this area yet.":"Choose a shop to see its menu.";
}
async function loadShops(){
  $("shopMessage").textContent="Loading approved shops…";
  const r=await api("/api/shops","GET",null,true);
  if(!Array.isArray(r.shops))throw Error("Shops unavailable");
  shops=r.shops;
  for(const shop of shops){
    if(shop.area&&!Array.from($("area").options).some(o=>areaKey(o.value)===areaKey(shop.area)))
      $("area").add(new Option(shop.area,shop.area));
  }
  showShops();
}
bind("loadShops",loadShops);
$("area").addEventListener("change",showShops);
$("shop").onchange=safe(async()=>{
  const id=$("shop").value;clearChoice();menuShop=id;menu=[];
  if(!id)return;
  $("menuSection").hidden=false;$("menuItems").textContent="Loading menu…";
  const r=await api("/api/shops/"+encodeURIComponent(id)+"/menu","GET",null,true);
  if(menuShop!==id||$("shop").value!==id)return;
  if(!Array.isArray(r.items))throw Error("Menu unavailable");
  menu=r.items.filter(x=>Number.isInteger(x.price_cents)&&x.price_cents>=0);
  $("menuItems").replaceChildren();
  if(!menu.length){$("menuItems").textContent="No menu items available yet.";return}
  for(const item of menu){
    const row=document.createElement("div");row.className="menuRow";
    const name=document.createElement("strong");name.textContent=item.name;
    const price=document.createElement("button");price.type="button";price.className="priceButton";
    price.textContent=money(item.price_cents);
    price.setAttribute("aria-label","Choose "+item.name+" for "+money(item.price_cents));
    price.onclick=()=>{
      if($("shop").value!==id)return;
      selectedItem=item;cart=[{itemId:item.id,quantity:1}];requestId=null;
      $("quantity").value="1";updateSummary();
      $("confirmSection").hidden=false;
      $("confirmSection").scrollIntoView({behavior:"smooth",block:"start"});
    };
    row.append(name,price);$("menuItems").append(row);
  }
  out("Tap the price of the Kota you want.");
});
function updateSummary(){
  if(!selectedItem)return;
  const qty=Number($("quantity").value);
  $("orderSummary").textContent=selectedItem.name+" — "+money(selectedItem.price_cents)+" each";
  $("orderTotal").textContent=Number.isInteger(qty)&&qty>=1&&qty<=50?
    "Item subtotal: "+money(selectedItem.price_cents*qty):"Quantity must be 1 to 50";
}
$("quantity").oninput=()=>{requestId=null;updateSummary()};
$("fulfillment").onchange=()=>{
  const delivery=$("fulfillment").value==="delivery";
  $("deliveryLabel").hidden=!delivery;$("address").required=delivery;
  if(!delivery)$("address").value="";
  requestId=null;
};
$("backToMenu").onclick=()=>{$("confirmSection").hidden=true;$("menuSection").scrollIntoView({behavior:"smooth"})};
for(const id of ["customerName","customerPhone","address"])$(id).oninput=()=>{requestId=null};
$("checkout").onsubmit=event=>{event.preventDefault();safe(async()=>{
  const quantity=Number($("quantity").value);
  if(!selectedItem||!$("shop").value||!$("area").value)throw Error("Choose a shop and item price first");
  if(!Number.isInteger(quantity)||quantity<1||quantity>50)throw Error("Quantity must be between 1 and 50");
  if($("fulfillment").value==="delivery"&&!$("address").value.trim())throw Error("Delivery address required");
  if(!requestId)requestId=crypto.randomUUID();
  $("confirmOrder").disabled=true;
  try{
    const r=await api("/api/orders","POST",{
      requestId,shopId:$("shop").value,items:[{itemId:selectedItem.id,quantity}],
      customerName:$("customerName").value.trim(),customerPhone:$("customerPhone").value.trim(),
      area:$("area").value,fulfillmentType:$("fulfillment").value,
      deliveryAddress:$("fulfillment").value==="delivery"?$("address").value.trim():""
    });
    if(!r.order?.id)throw Error("Order response incomplete. Check My orders before trying again.");
    $("orderId").value=r.order.id;
    requestId=null;selectedItem=null;$("confirmSection").hidden=true;
    out("Order placed! Tap Track to see the status.");
  }finally{$("confirmOrder").disabled=false}
})()};
const label=status=>({pending:"Sent to shop",accepted:"Accepted",preparing:"Preparing",delayed:"Delayed",
  ready_for_collection:"Ready for collection",out_for_delivery:"Out for delivery",
  completed:"Completed",rejected:"Declined"})[status]||String(status||"Pending").replaceAll("_"," ");
bind("myOrders",async()=>{
  const r=await api("/api/orders/mine");const orders=Array.isArray(r.orders)?r.orders:[];
  const list=orders.map(o=>(o.order_number||"Order")+" — "+label(o.status)).join("\n");
  out(list||"No previous orders found on this browser.");
  if(orders[0]?.id)$("orderId").value=orders[0].id;
});
bind("track",async()=>{
  const id=$("orderId").value;
  if(!id)throw Error("Place an order first or open My orders.");
  const r=await api("/api/orders/"+encodeURIComponent(id));
  out((r.order?.order_number||"Your order")+" — "+label(r.order?.status));
});
bind("items",async()=>out(await api("/api/orders/"+encodeURIComponent($("orderId").value)+"/items")));
bind("timeline",async()=>out(await api("/api/orders/"+encodeURIComponent($("orderId").value)+"/history")));
}
if(role==="owner"){
bind("apply",async()=>out(await api("/api/shop-applications","POST",{ownerName:$("ownerName").value,shopName:$("shopName").value,phone:$("phone").value,area:$("area").value,address:$("address").value,description:$("description").value})));
bind("applications",async()=>out(await api("/api/shop-applications/mine")));
bind("myShops",async()=>{const r=await api("/api/owner/shops");option($("shop"),r.shops,x=>x.name);out(r)});
bind("myMenu",async()=>out(await api("/api/owner/shops/"+encodeURIComponent($("shop").value)+"/menu")));
bind("addMenu",async()=>out(await api("/api/owner/shops/"+encodeURIComponent($("shop").value)+"/menu","POST",{name:$("itemName").value,priceCents:Math.round(Number($("price").value)*100)})));
bind("editMenu",async()=>out(await api("/api/owner/shops/"+encodeURIComponent($("shop").value)+"/menu/"+encodeURIComponent($("menuItemId").value),"PATCH",{name:$("editItemName").value,priceCents:Math.round(Number($("editPrice").value)*100),available:$("available").checked})));
bind("myOrders",async()=>out(await api("/api/owner/orders")));
bind("orderItems",async()=>out(await api("/api/orders/"+encodeURIComponent($("orderId").value)+"/items")));
bind("updateStatus",async()=>out(await api("/api/owner/orders/"+encodeURIComponent($("orderId").value)+"/status","PATCH",{status:$("status").value,note:$("note").value})));
}
if(role==="admin"){
bind("applications",async()=>out(await api("/api/admin/shop-applications")));
bind("approve",async()=>out(await api("/api/admin/shop-applications/"+encodeURIComponent($("applicationId").value)+"/review","PATCH",{status:"approved"})));
bind("reject",async()=>out(await api("/api/admin/shop-applications/"+encodeURIComponent($("applicationId").value)+"/review","PATCH",{status:"rejected"})));
bind("orders",async()=>out(await api("/api/admin/orders")));
}
bind("notifications",async()=>out(await api("/api/notifications")));
bind("markRead",async()=>out(await api("/api/notifications/"+encodeURIComponent($("notificationId").value)+"/read","PATCH")));
async function pollNotifications(){if(document.visibilityState!=="visible"||(role==="owner"||role==="admin")&&!dashboardAccess)return;try{const r=await api("/api/notifications");const unread=r.notifications.filter(n=>!n.read_at).length;$("unread").textContent=unread?unread+" unread notifications":"No unread notifications"}catch{$("unread").textContent="Sign in to see notifications"}}
showIdentity().then(pollNotifications).catch(()=>{});
setInterval(pollNotifications,20000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")pollNotifications()});
