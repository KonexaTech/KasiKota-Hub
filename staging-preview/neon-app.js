import { createAuthClient } from "https://esm.sh/@neon/auth@latest";
const AUTH_URL=new URL("/auth",location.origin).href;
const auth=createAuthClient(AUTH_URL);
const $=id=>document.getElementById(id), role=document.body.dataset.role;
const API="https://kota-connect-api-dev.siboniisozulu.workers.dev";
let requestId=null,menu=[],cart=[];
let dashboardAccess=false;
let ownerOrders=[];
let loadOwnerOrders=async()=>{};
let refreshCustomerTracking=async()=>{};
const orderIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lastTrackedOrderStorageKey="kota_connect_last_tracked_order_id";
function rememberTrackedOrder(id){try{localStorage.setItem(lastTrackedOrderStorageKey,id)}catch{}}

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
async function api(path,method="GET",body,publicRoute=false){const headers={"content-type":"application/json"};if(!publicRoute){headers.authorization="Bearer "+await apiJwt()}const response=await fetch(API+path,{method,headers,body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw Error(data.error||"Request failed");return data}
function option(select,items,label){select.replaceChildren(new Option("Select",""),...items.map(x=>new Option(label(x),x.id)))}
async function showIdentity(){
  showDashboardPanels(false);
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
$("signin").addEventListener("submit",e=>{e.preventDefault();safe(async()=>{const r=await auth.signIn.email({email:$("email").value,password:$("password").value});if(r.error)throw Error(r.error.message);if(!r.data)throw Error("Sign-in did not return an account");await showIdentity();if(role==="owner"&&dashboardAccess)await loadOwnerOrders(false);if(role==="owner"&&!dashboardAccess)throw Error("Administrator accounts cannot sign in as shop owners. Sign out and use another owner account.");if(role==="admin"&&!dashboardAccess)throw Error("This account is not authorized as an administrator.");out(role==="admin"?"Signed in. Administrator access verified.":"Signed in")})()});
bind("sendVerification",async()=>{const email=$("email").value.trim();if(!email)throw Error("Enter your email address first");const r=await auth.emailOtp.sendVerificationOtp({email,type:"email-verification"});if(r.error)throw Error(r.error.message);out("Verification code requested. Check your inbox and spam folder.")});
bind("verifyEmail",async()=>{const email=$("email").value.trim(),otp=$("verificationCode").value.trim();if(!email||!otp)throw Error("Enter your email and verification code");const r=await auth.emailOtp.verifyEmail({email,otp});if(r.error)throw Error(r.error.message);out("Email verified. You can sign in with your password. Use Reset password only if you need to change it.")});
bind("forgotPassword",async()=>{const email=$("email").value.trim();if(!email)throw Error("Enter your email address first");const r=await auth.requestPasswordReset({email,redirectTo:new URL("./neon-reset-password.html",location.href).href});if(r.error)throw Error(r.error.message);out("If this account exists, a recovery email has been sent. Check inbox and spam. The link expires after one hour.")});
$("signup").onclick=safe(async()=>{const email=$("email").value;const r=await auth.signUp.email({email,password:$("password").value,name:email.split("@")[0]});if(r.error)throw Error(r.error.message);await showIdentity();out(role==="owner"?"Account created. Send a verification code and verify your email before signing in or applying for a shop.":"Account created")});
$("signout").onclick=safe(async()=>{await auth.signOut();await showIdentity();out("Signed out")});
function bind(id,fn){const el=$(id);if(el)el.onclick=safe(fn)}
if(role==="customer"){
bind("loadShops",async()=>{const data=await api("/api/shops","GET",null,true);option($("shop"),data.shops,x=>x.name+" — "+x.area);out(data.shops.length+" approved shops")});
$("shop").onchange=safe(async()=>{const id=$("shop").value;if(!id)return;const data=await api("/api/shops/"+encodeURIComponent(id)+"/menu","GET",null,true);menu=data.items;option($("item"),menu,x=>x.name+" — R"+(x.price_cents/100).toFixed(2));cart=[];requestId=null;$("cart").textContent="Cart empty";out(data.items.length+" menu items")});
bind("addCart",async()=>{const item=menu.find(x=>x.id===$("item").value),quantity=Number($("quantity").value);if(!item||!Number.isInteger(quantity)||quantity<1||quantity>50)throw Error("Select a menu item and quantity");const current=cart.find(x=>x.itemId===item.id);if(current){if(current.quantity+quantity>50)throw Error("Maximum 50 per item");current.quantity+=quantity}else cart.push({itemId:item.id,quantity});requestId=null;$("cart").textContent=cart.map(x=>{const m=menu.find(i=>i.id===x.itemId);return m.name+" × "+x.quantity}).join(", ");out("Added to cart")});
bind("clearCart",async()=>{cart=[];requestId=null;$("cart").textContent="Cart empty";out("Cart cleared")});
$("checkout").onsubmit=e=>{e.preventDefault();safe(async()=>{if(!requestId)requestId=crypto.randomUUID();const data=await api("/api/orders","POST",{requestId,shopId:$("shop").value,items:cart.length?cart:[{itemId:$("item").value,quantity:Number($("quantity").value)}],customerName:$("customerName").value,customerPhone:$("customerPhone").value,area:$("area").value,fulfillmentType:$("fulfillment").value,deliveryAddress:$("address").value});requestId=null;cart=[];$("cart").textContent="Cart empty";$("orderId").value=data.order.id;rememberTrackedOrder(data.order.id);await refreshCustomerTracking(false);out(data)})()};
bind("myOrders",async()=>out(await api("/api/orders/mine")));
let trackingInFlight=false,lastObservedStatus="";
refreshCustomerTracking=async function(announce=false){
  const id=$("orderId").value.trim();
  if(!orderIdPattern.test(id)){if(announce)throw Error("Choose an order or enter its valid Order ID");return}
  if(trackingInFlight)return;
  trackingInFlight=true;
  try{
    const response=await api("/api/orders/"+encodeURIComponent(id));
    if(!response?.order?.status)throw Error("The order could not be loaded");
    const order=response.order;
    const changed=lastObservedStatus && lastObservedStatus!==order.status;
    lastObservedStatus=order.status;
    $("trackingStatus").textContent="Order "+order.order_number+" — "+order.status.replaceAll("_"," ")+(changed?" (updated)":"");
    $("trackingChecked").textContent="Last checked "+new Date().toLocaleTimeString()+". Checking every 10 seconds while this page is open.";
    rememberTrackedOrder(id);
    if(announce)out(response);
  }catch(error){
    $("trackingChecked").textContent="Unable to refresh tracking: "+error.message;
    if(announce)throw error;
  }finally{trackingInFlight=false}
};
bind("track",async()=>refreshCustomerTracking(true));
try{const saved=localStorage.getItem(lastTrackedOrderStorageKey);if(orderIdPattern.test(saved||"")&&!$("orderId").value)$("orderId").value=saved}catch{}
$("orderId").addEventListener("change",()=>{lastObservedStatus="";refreshCustomerTracking(false).catch(()=>{})});
setInterval(()=>{if(document.visibilityState==="visible")refreshCustomerTracking(false).catch(()=>{})},10000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refreshCustomerTracking(false).catch(()=>{})});
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
const allowedOwnerTransitions={
  pending:["accepted","rejected"],
  accepted:["preparing","delayed","rejected"],
  preparing:["ready_for_collection","out_for_delivery","delayed"],
  delayed:["accepted","preparing","ready_for_collection","out_for_delivery","rejected"],
  ready_for_collection:["completed"],
  out_for_delivery:["completed"]
};
function nextOwnerStatuses(order){
  return (allowedOwnerTransitions[order.status]||[]).filter(value=>
    value!=="ready_for_collection"||order.fulfillment_type==="pickup"
  ).filter(value=>value!=="out_for_delivery"||order.fulfillment_type==="delivery");
}
function updateOwnerOrderSelection(){
  const id=$("orderId").value.trim();
  const selected=ownerOrders.find(order=>order.id===id);
  const dropdown=$("ownerOrderSelect");
  dropdown.value=selected?.id||"";
  const allowed=selected?nextOwnerStatuses(selected):[];
  const next=$("status");
  next.replaceChildren(...(allowed.length?allowed.map(status=>new Option(status.replaceAll("_"," "),status)):[new Option("Choose an order first","")]));
  next.disabled=!allowed.length;
  $("updateStatus").disabled=!allowed.length;
  $("currentOrderStatus").textContent=selected?
    "Current saved status: "+selected.status.replaceAll("_"," ")+". "+(allowed.length?"Choose the next step and press Update order.":"This order is finished; no more updates are available."):
    "Click Refresh orders, then select the customer's order.";
}
loadOwnerOrders=async function(announce=true){
  const response=await api("/api/owner/orders");
  ownerOrders=Array.isArray(response.orders)?response.orders:[];
  const selectedId=$("orderId").value.trim();
  const picker=$("ownerOrderSelect");
  picker.replaceChildren(new Option("Select an incoming order",""),...ownerOrders.map(order=>
    new Option(order.order_number+" — "+order.customer_name+" — "+order.status.replaceAll("_"," "),order.id)));
  const current=ownerOrders.find(order=>order.id===selectedId);
  const selected=current || (ownerOrders.length===1?ownerOrders[0]:null);
  $("orderId").value=selected?.id||"";
  updateOwnerOrderSelection();
  if(announce)out(ownerOrders.length?response:"No customer orders found for your shops.");
};
$("ownerOrderSelect").addEventListener("change",()=>{
  $("orderId").value=$("ownerOrderSelect").value;
  updateOwnerOrderSelection();
});
$("orderId").addEventListener("input",updateOwnerOrderSelection);
bind("myOrders",async()=>loadOwnerOrders(true));
bind("orderItems",async()=>out(await api("/api/orders/"+encodeURIComponent($("orderId").value)+"/items")));
bind("updateStatus",async()=>{
  const id=$("orderId").value.trim();
  const selected=ownerOrders.find(order=>order.id===id);
  if(!selected)throw Error("Click Refresh orders and select the correct incoming order first.");
  const status=$("status").value;
  if(!nextOwnerStatuses(selected).includes(status))throw Error("Choose a valid next status after "+selected.status+".");
  $("updateStatus").disabled=true;
  try{
    await api("/api/owner/orders/"+encodeURIComponent(id)+"/status","PATCH",{status,note:$("note").value});
    // Confirm the saved status from Neon instead of displaying the dropdown as if it succeeded.
    const verified=await api("/api/orders/"+encodeURIComponent(id));
    if(verified.order?.status!==status)throw Error("The API did not confirm the status change. Refresh orders before retrying.");
    await loadOwnerOrders(false);
    out("Status saved: "+verified.order.order_number+" — "+status.replaceAll("_"," ")+". Customer tracking will reflect this saved status.");
  }finally{
    updateOwnerOrderSelection();
  }
});
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
showIdentity().then(async()=>{if(role==="owner"&&dashboardAccess)await loadOwnerOrders(false);if(role==="customer")await refreshCustomerTracking(false);await pollNotifications()}).catch(()=>{});
setInterval(pollNotifications,20000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")pollNotifications()});
