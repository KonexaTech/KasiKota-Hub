import { createAuthClient } from "https://esm.sh/@neon/auth@latest";
import { parseMenuText, formatMenuText, planMenuChanges } from "./menu-text.mjs";
const AUTH_URL=new URL("/auth",location.origin).href;
const auth=createAuthClient(AUTH_URL);
const $=id=>document.getElementById(id), role=document.body.dataset.role;
const API="https://kota-connect-api-dev.siboniisozulu.workers.dev";
let requestId=null,menu=[],cart=[];
let dashboardAccess=false;
 fix/no-account-guest-checkout-20261119
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

let ownerOrders=[];
let loadOwnerOrders=async()=>{};
let refreshCustomerTracking=async()=>{};
const orderIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lastTrackedOrderStorageKey="kota_connect_last_tracked_order_id";
function rememberTrackedOrder(id){try{localStorage.setItem(lastTrackedOrderStorageKey,id)}catch{}}
 feature/neon-only-cutover
function showDashboardPanels(allowed){dashboardAccess=Boolean(allowed);document.querySelectorAll('[data-restricted-panel]').forEach(panel=>{panel.hidden=!dashboardAccess})}
const out=(message)=>{$("result").textContent=typeof message==="string"?message:JSON.stringify(message,null,2)};
function required(id,label){const value=$(id)?.value?.trim();if(!value)throw Error(label+" is required");return value}
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
fix/no-account-guest-checkout-20261119
if(role!=="customer"){
$("signin").addEventListener("submit",e=>{e.preventDefault();safe(async()=>{const r=await auth.signIn.email({email:$("email").value,password:$("password").value});if(r.error)throw Error(r.error.message);if(!r.data)throw Error("Sign-in did not return an account");await showIdentity();if(role==="owner"&&!dashboardAccess)throw Error("Administrator accounts cannot sign in as shop owners. Sign out and use another owner account.");if(role==="admin"&&!dashboardAccess)throw Error("This account is not authorized as an administrator.");out(role==="admin"?"Signed in. Administrator access verified.":"Signed in")})()});

$("signin").addEventListener("submit",e=>{e.preventDefault();safe(async()=>{const r=await auth.signIn.email({email:$("email").value,password:$("password").value});if(r.error)throw Error(r.error.message);if(!r.data)throw Error("Sign-in did not return an account");await showIdentity();if(role==="owner"&&dashboardAccess)await loadOwnerOrders(false);if(role==="owner"&&!dashboardAccess)throw Error("Administrator accounts cannot sign in as shop owners. Sign out and use another owner account.");if(role==="admin"&&!dashboardAccess)throw Error("This account is not authorized as an administrator.");out(role==="admin"?"Signed in. Administrator access verified.":"Signed in")})()});
feature/neon-only-cutover
bind("sendVerification",async()=>{const email=$("email").value.trim();if(!email)throw Error("Enter your email address first");const r=await auth.emailOtp.sendVerificationOtp({email,type:"email-verification"});if(r.error)throw Error(r.error.message);out("Verification code requested. Check your inbox and spam folder.")});
bind("verifyEmail",async()=>{const email=$("email").value.trim(),otp=$("verificationCode").value.trim();if(!email||!otp)throw Error("Enter your email and verification code");const r=await auth.emailOtp.verifyEmail({email,otp});if(r.error)throw Error(r.error.message);out("Email verified. You can sign in with your password. Use Reset password only if you need to change it.")});
bind("forgotPassword",async()=>{const email=$("email").value.trim();if(!email)throw Error("Enter your email address first");const r=await auth.requestPasswordReset({email,redirectTo:new URL("./neon-reset-password.html",location.href).href});if(r.error)throw Error(r.error.message);out("If this account exists, a recovery email has been sent. Check inbox and spam. The link expires after one hour.")});
$("signup").onclick=safe(async()=>{const email=$("email").value;const r=await auth.signUp.email({email,password:$("password").value,name:email.split("@")[0]});if(r.error)throw Error(r.error.message);await showIdentity();out(role==="owner"?"Account created. Send a verification code and verify your email before signing in or applying for a shop.":"Account created")});
$("signout").onclick=safe(async()=>{await auth.signOut();await showIdentity();out("Signed out")});
}
function bind(id,fn){const el=$(id);if(el)el.onclick=safe(fn)}
if(role==="customer"){
 fix/no-account-guest-checkout-20261119
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
 feature/neon-only-cutover
bind("items",async()=>out(await api("/api/orders/"+encodeURIComponent($("orderId").value)+"/items")));
bind("timeline",async()=>out(await api("/api/orders/"+encodeURIComponent($("orderId").value)+"/history")));
}
if(role==="owner"){
let menuLoadedShop="",menuSnapshot="";
const menuUrl=shopId=>"/api/owner/shops/"+encodeURIComponent(shopId)+"/menu";
const menuFingerprint=items=>JSON.stringify(items.map(item=>[item.id,item.name,item.price_cents,item.available]));
async function ownerMenu(shopId){const data=await api(menuUrl(shopId));if(!Array.isArray(data.items))throw Error("Unable to read shop menu");return data.items}
async function viewOwnerMenu(){
  const shopId=required("shop","Shop"),items=await ownerMenu(shopId);
  menuLoadedShop=shopId;menuSnapshot=menuFingerprint(items);
  $("menuText").value=formatMenuText(items);
  out("Loaded "+items.filter(item=>item.available).length+" available menu items. Edit the text and press Save menu and prices.");
}
$("shop").addEventListener("change",()=>{menuLoadedShop="";menuSnapshot="";$("menuText").value="";});
bind("apply",async()=>out(await api("/api/shop-applications","POST",{ownerName:$("ownerName").value,shopName:$("shopName").value,phone:$("phone").value,area:$("area").value,address:$("address").value,description:$("description").value})));
bind("applications",async()=>out(await api("/api/shop-applications/mine")));
let editableShops=[];
function showEditableShop(){
  const current=editableShops.find(s=>s.id===$("shop").value);
  $("editShopName").value=current?.name||"";
  $("editShopArea").value=current?.area||"";
  $("editShopPhone").value=current?.phone||"";
  $("editShopAddress").value=current?.address||"";
}
$("shop").addEventListener("change",showEditableShop);
bind("saveShopDetails",async()=>{
  const id=required("shop","Shop");
  const body={name:required("editShopName","Shop name"),area:required("editShopArea","Shop area"),phone:required("editShopPhone","Shop phone"),address:$("editShopAddress").value.trim()};
  const result=await api("/api/owner/shops/"+encodeURIComponent(id),"PATCH",body);
  const index=editableShops.findIndex(s=>s.id===id);if(index>=0)editableShops[index]={...editableShops[index],...result.shop};
  const selected=$("shop").selectedIndex;if(selected>=0)$("shop").options[selected].textContent=result.shop.name;
  out("Shop details saved. Approved status and existing orders were not changed.");
});

bind("myShops",async()=>{const r=await api("/api/owner/shops");editableShops=r.shops;option($("shop"),r.shops,x=>x.name);showEditableShop();menuLoadedShop="";menuSnapshot="";$("menuText").value="";out(r.shops.length+" shops found. Select your shop and press View menu.");});
bind("myMenu",viewOwnerMenu);
bind("saveMenu",async()=>{
  const shopId=required("shop","Shop");
  if(menuLoadedShop!==shopId||!menuSnapshot)throw Error("Press View menu to load this shop's current menu before saving.");
  const desired=parseMenuText($("menuText").value);
  const existing=await ownerMenu(shopId);
  if(menuFingerprint(existing)!==menuSnapshot)throw Error("This menu was changed since it was loaded. Press View menu to reload before saving.");
  const changes=planMenuChanges(existing,desired);
  const removed=changes.filter(change=>change.type==="hide").length;
  if(removed&&!window.confirm("Make "+removed+" item(s) unavailable for customers? Existing orders will be preserved.")){out("Save cancelled. No menu changes made.");return}
  if(!changes.length){out("Menu already up to date. "+desired.length+" items.");return}
  let saved=0;
  try{
    for(const change of changes){
      if(change.type==="create"){
        await api(menuUrl(shopId),"POST",{name:change.name,priceCents:change.priceCents});
      }else{
        await api(menuUrl(shopId)+"/"+encodeURIComponent(change.id),"PATCH",{name:change.name,priceCents:change.priceCents,available:change.available});
      }
      saved++;
    }
  }catch(e){throw Error("Menu save incomplete ("+saved+"/"+changes.length+" changes applied): "+e.message+". Keep your draft and press View menu to review current data before trying again.")}
  await viewOwnerMenu();
  out("Menu saved: "+desired.length+" available items; "+removed+" made unavailable. Existing order history preserved.");
});
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
bind("adminOverview",async()=>{
  const data=await api("/api/admin/overview");
  $("registeredShops").textContent=String(data.shopCount);
  $("approvedShops").textContent=String(data.approvedShopCount);
  $("pendingApplications").textContent=String((data.applications||[]).find(x=>x.status==="pending")?.count||0);
  $("commissionDue").textContent="R"+(data.estimatedCommissionCents/100).toFixed(2)+" estimated";
  $("commissionCollected").textContent=data.collectedCommissionCents===null?"Not yet verifiable":"R"+(data.collectedCommissionCents/100).toFixed(2);
  $("commissionNotice").textContent=data.commissionCollectionStatus||"Commission collection reports require confirmed payment records.";
  const list=$("adminShopList");list.replaceChildren();
  for(const shop of data.shops||[]){
    const entry=document.createElement("div");entry.style.cssText="border:1px solid #d8e6dc;border-radius:12px;padding:12px";
    const title=document.createElement("strong");title.textContent=shop.name+" — "+(shop.approved?"Approved":"Not approved");
    const address=document.createElement("p");address.textContent=[shop.area,shop.address,shop.phone].filter(Boolean).join(" · ");
    entry.append(title,address);list.append(entry);
  }
  out("Administrator dashboard loaded. Registered shops: "+data.shopCount);
});
async function loadApplications(){
  const data=await api("/api/admin/shop-applications");
  const applications=Array.isArray(data.applications)?data.applications:[];
  const picker=$("applicationPicker"),current=$("applicationId").value;
  picker.replaceChildren(new Option("Choose pending application",""),...applications.filter(a=>a.status==="pending").map(a=>new Option(a.shop_name+" — "+a.area+" ("+a.owner_name+")",a.id)));
  if(applications.some(a=>a.id===current&&a.status==="pending"))picker.value=current;
  out("Applications: "+applications.length+" total; "+applications.filter(a=>a.status==="pending").length+" pending.");
}
$("applicationPicker").addEventListener("change",()=>{$("applicationId").value=$("applicationPicker").value});
bind("applications",loadApplications);
bind("approve",async()=>{const id=required("applicationId","Application");if(!window.confirm("Approve this shop application?"))return;await api("/api/admin/shop-applications/"+encodeURIComponent(id)+"/review","PATCH",{status:"approved"});await loadApplications();out("Shop approved. Refresh dashboard totals to see the updated record.");});
bind("reject",async()=>{const id=required("applicationId","Application");if(!window.confirm("Reject this shop application?"))return;await api("/api/admin/shop-applications/"+encodeURIComponent(id)+"/review","PATCH",{status:"rejected"});await loadApplications();out("Shop application rejected. Refresh dashboard totals to see updated counts.");});
bind("orders",async()=>out(await api("/api/admin/orders")));
}
bind("notifications",async()=>out(await api("/api/notifications")));
bind("markRead",async()=>out(await api("/api/notifications/"+encodeURIComponent($("notificationId").value)+"/read","PATCH")));
async function pollNotifications(){if(document.visibilityState!=="visible"||(role==="owner"||role==="admin")&&!dashboardAccess)return;try{const r=await api("/api/notifications");const unread=r.notifications.filter(n=>!n.read_at).length;$("unread").textContent=unread?unread+" unread notifications":"No unread notifications"}catch{$("unread").textContent="Sign in to see notifications"}}
showIdentity().then(async()=>{if(role==="owner"&&dashboardAccess)await loadOwnerOrders(false);if(role==="customer")await refreshCustomerTracking(false);await pollNotifications()}).catch(()=>{});
setInterval(pollNotifications,20000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")pollNotifications()});
