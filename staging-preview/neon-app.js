import {mountDeliveryProof} from "./delivery-proof-control.mjs";
import {captureDeliveryLocation} from "./delivery-location.mjs";
import { createAuthClient } from "https://esm.sh/@neon/auth@latest";
import { parseMenuText, formatMenuText, planMenuChanges } from "./menu-text.mjs";
const AUTH_URL=new URL("/auth",location.origin).href;
const auth=createAuthClient(AUTH_URL);
const $=id=>document.getElementById(id), role=document.body.dataset.role;
// Use the same-origin Pages proxy; it forwards Authorization to the isolated staging Worker.
const API="";
let requestId=null,menu=[],cart=[];
let dashboardAccess=false;
let adminShopRevision=0,clearAdminShopDecisions=()=>{};
let ownerOrders=[];
let loadOwnerOrders=async()=>{};
let clearOwnerProof=()=>{};
let loadAdminOrders=async()=>{};
let loadAdminCommission=async()=>{};
let refreshCustomerTracking=async()=>{};
const orderIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lastTrackedOrderStorageKey="kota_connect_last_tracked_order_id";
function rememberTrackedOrder(id){try{localStorage.setItem(lastTrackedOrderStorageKey,id)}catch{}}
function showDashboardPanels(allowed){
  if(!allowed){adminShopRevision++;clearAdminShopDecisions();}
  if(!allowed)clearOwnerProof();
  dashboardAccess=Boolean(allowed);
  document.querySelectorAll('[data-restricted-panel]').forEach(panel=>{panel.hidden=!dashboardAccess});
  if(!dashboardAccess){
    currentNotifications=[];notificationRevision++;
    if($("markAllRead"))$("markAllRead").disabled=true;
    for(const id of ["manageShopDialog","customerOrdersDialog","notificationsPanel","commissionDialog"])if($(id)?.open)$(id).close();
    $("notificationList")?.replaceChildren();
    if($("unread"))$("unread").textContent="Sign in to see notifications.";
    if($("openNotifications"))$("openNotifications").textContent="🔔 Notifications";
    if($("adminOrderList"))$("adminOrderList").replaceChildren();
    if($("adminOrderCount"))$("adminOrderCount").textContent="Sign in to view the latest orders.";
    if($("commissionPreviewAmount"))$("commissionPreviewAmount").textContent="R0.00";
  }
}
function showAccountActions(signedIn){
  if($("signedInAccountActions"))$("signedInAccountActions").hidden=!signedIn;
  if($("signin"))$("signin").hidden=Boolean(signedIn);
  if($("verificationHelp"))$("verificationHelp").hidden=Boolean(signedIn);
  if(!signedIn){
    if($("passwordResetFields"))$("passwordResetFields").hidden=true;
    if($("togglePasswordReset"))$("togglePasswordReset").setAttribute("aria-expanded","false");
  }
}

function clearAccountSecrets(){
  for(const id of ["password","newPassword","verificationCode","emailVerificationCode"]){const input=$(id);if(input)input.value="";}
}
async function confirmedSignOut(){
  clearAccountSecrets();showDashboardPanels(false);
  try{await auth.signOut()}catch{}
  try{
    const response=await fetch(AUTH_URL+"/get-session",{credentials:"include",cache:"no-store",headers:{accept:"application/json"}});
    const session=await response.json();
    if(!response.ok||!(session===null||session&&Object.hasOwn(session,"user")&&session.user==null&&!session.error))throw Error("Session is still active or unavailable");
  }catch{throw Error("Sign-out was not confirmed. Please retry signing out.");}
  showAccountActions(false);$("identity").textContent="Not signed in";
}
const out=(message)=>{$("result").textContent=typeof message==="string"?message:JSON.stringify(message,null,2)};
function required(id,label){const value=$(id)?.value?.trim();if(!value)throw Error(label+" is required");return value}
const safe=(fn)=>async()=>{try{await fn()}catch(e){out("Error: "+e.message)}};
function isSignedJwt(value){
  return typeof value==="string" && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}
async function apiJwt(){
  const tokenUrl=AUTH_URL.replace(/\/$/,"")+"/token";
  let response;
  try{response=await fetch(tokenUrl,{method:"GET",credentials:"include",cache:"no-store",headers:{accept:"application/json"}});}
  catch(error){throw Error("Neon JWT endpoint could not be reached: "+(error?.message||"network error"));}
  let result;
  try{result=await response.json();}
  catch{throw Error("Neon JWT endpoint returned an invalid response (HTTP "+response.status+")");}
  const token=result?.token??result?.data?.token;
  if(response.ok&&isSignedJwt(token))return token;
  const state=!response.ok?"HTTP "+response.status:"HTTP "+response.status+" without a signed JWT";
  const reason=typeof result?.error?.message==="string"?result.error.message:typeof result?.message==="string"?result.message:null;
  throw Error("Neon JWT endpoint failed ("+state+")"+(reason?": "+reason:""));
}
async function api(path,method="GET",body,publicRoute=false){const headers={"content-type":"application/json"};if(!publicRoute){headers.authorization="Bearer "+await apiJwt()}const response=await fetch(API+path,{method,headers,body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok){const error=Error(data.error||"Request failed");error.status=response.status;throw error;}return data}
function option(select,items,label){select.replaceChildren(new Option("Select",""),...items.map(x=>new Option(label(x),x.id)))}
async function showIdentity(){
  showDashboardPanels(false);
  showAccountActions(false);
  const r=await auth.getSession();
  if(r.error)throw Error(r.error.message);
  if(!r.data?.user){$("identity").textContent="Not signed in";return}
  if(role!=="owner"&&role!=="admin"){showDashboardPanels(true);showAccountActions(true);$("identity").textContent=r.data.user.email;return}
  if(r.data.user.emailVerified===false){showDashboardPanels(false);$("identity").textContent="Email verification required. Send a verification code and verify your email before using this dashboard.";return}
  try{
    const me=await api("/api/me");
    const ownerAccess=role==="owner"?await api("/api/owner/access"):null;
    const allowed=role==="admin"?me.admin===true:me.admin===false&&ownerAccess?.approved===true;
    showDashboardPanels(allowed);
    showAccountActions(allowed);
    if(allowed&&r.data.user.email&&!$("email").value)$("email").value=r.data.user.email;
    $("identity").textContent=allowed?r.data.user.email:(role==="owner"?(me.admin?"Owner access denied: administrator accounts cannot access the shop dashboard.":"Your shop is awaiting administrator approval. Dashboard access is locked until approval."):"Administrator access denied: this account is not an approved administrator.");
  }catch(e){
    const message=String(e?.message||"please sign in again.");
    $("identity").textContent=message.includes("Email verification required")
      ?"Email verification required. Send a verification code and verify your email before using this dashboard."
      :"Unable to verify "+role+" access: "+message;
    throw e;
  }
}
let signInPending=false;
$("signin").addEventListener("submit",e=>{
  e.preventDefault();
  if(signInPending)return;
  signInPending=true;
  const submit=$("signin").querySelector('button[type="submit"],button:not([type])');
  const original=submit?.textContent;
  if(submit){submit.disabled=true;submit.textContent="Signing in…";submit.setAttribute("aria-busy","true")}
  out("Signing in…");
  (async()=>{
    const r=await auth.signIn.email({email:$("email").value,password:$("password").value});
    if(r.error)throw Error(r.error.message);
    if(!r.data)throw Error("Sign-in did not return an account");
    clearAccountSecrets();
    await showIdentity();
    const current=await auth.getSession();
    if(current.data?.user?.emailVerified===false){
      out("Email verification required. Use Send verification code and Verify email before accessing the dashboard.");
      return;
    }
    if(role==="owner"&&dashboardAccess){
      await loadOwnerOrders(false);
      await pollNotifications(true);
      out("Signed in. Your shop is approved.");
    }else if(role==="owner"){
      const identity=$("identity").textContent||"";
      await auth.signOut();
      await showIdentity();
      if(identity.startsWith("Owner access denied: administrator accounts"))throw Error("Administrator accounts cannot sign in to the shop-owner dashboard.");
      out("Your shop is awaiting administrator approval. You can sign in to the owner dashboard after approval.");
    }else if(role==="admin"&&!dashboardAccess){
      await auth.signOut();
      await showIdentity();
      throw Error("This account is not authorized as an administrator.");
    }else{
      if(role==="admin"){await loadAdminOrders(false);await loadAdminCommission(false);}
      await pollNotifications(true);
      out(role==="admin"?"Signed in. Administrator access verified.":"Signed in");
    }
  })().catch(error=>out("Error: "+error.message)).finally(()=>{
    signInPending=false;
    if(submit){submit.disabled=false;submit.textContent=original;submit.removeAttribute("aria-busy")}
  });
});
bind("sendVerification",async()=>{const email=($("email").value||$("regEmail")?.value||"").trim();if(!email)throw Error("Enter your email address first");const r=await auth.emailOtp.sendVerificationOtp({email,type:"email-verification"});if(r.error)throw Error(r.error.message);out("Verification code requested. Check your inbox and spam folder.")});
bind("verifyEmail",async()=>{
  const email=($("email").value||$("regEmail")?.value||"").trim(),otp=$("emailVerificationCode")?.value.trim();
  if(!email||!otp)throw Error("Enter your email and verification code");
  const r=await auth.emailOtp.verifyEmail({email,otp});
  if(r.error)throw Error(r.error.message);
  await auth.signOut();
  await showIdentity();
  $("registrationStatus")&&($("registrationStatus").textContent="Email verified. Sign in with your password. Owner dashboard access still requires administrator approval.");
  out("Email verified. Please sign in with your password. Owner access remains subject to administrator approval.");
});
bind("forgotPassword",async()=>{
  if(!dashboardAccess)throw Error("Sign in to your authorized dashboard before resetting your password.");
  const session=await auth.getSession();
  const email=String(session.data?.user?.email||"").trim().toLowerCase();
  if(!email)throw Error("Your signed-in email is not available.");
  const r=await auth.forgetPassword.emailOtp({email});
  if(r?.error)throw Error(r.error.message);
  out("If an account exists for this email, a password reset code has been sent. Enter the code, choose a new password and press Set new password.");
});
bind("completePasswordReset",async()=>{
  if(!dashboardAccess)throw Error("Sign in to your authorized dashboard before resetting your password.");
  const session=await auth.getSession();
  const email=String(session.data?.user?.email||"").trim().toLowerCase();
  if(!email)throw Error("Your signed-in email is not available.");
  const otp=required("verificationCode","Password reset code");
  const password=required("newPassword","New password");
  if(password.length<12)throw Error("Your new password must contain at least 12 characters.");
  const r=await auth.emailOtp.resetPassword({email,otp,password});
  if(r?.error)throw Error(r.error.message);
  $("verificationCode").value="";
  $("newPassword").value="";
  try{await confirmedSignOut()}catch{out("Password changed. Sign-out was not confirmed. Please retry signing out.");return;}
  out("Password changed successfully. Sign in with your new password.");
});
$("togglePasswordReset")?.addEventListener("click",()=>{
  if(!dashboardAccess)return out("Sign in with your authorized account to reset its password.");
  const fields=$("passwordResetFields");
  const expanded=fields.hidden;
  fields.hidden=!expanded;
  $("togglePasswordReset").setAttribute("aria-expanded",String(expanded));
  if(expanded)$("forgotPassword").focus();
});
bind("signup",async()=>{const email=$("email").value;const r=await auth.signUp.email({email,password:$("password").value,name:email.split("@")[0]});if(r.error)throw Error(r.error.message);await showIdentity();out("Account created. Use the shop registration button on the customer page to submit a shop application.")});
bind("signout",async()=>{await confirmedSignOut();out("Signed out")});
function bind(id,fn){
  const el=$(id);if(!el)return;
  el.onclick=safe(async()=>{
    if(el.dataset.kcWorking==="true")return;
    const label=el.textContent,wasDisabled=el.disabled;
    el.dataset.kcWorking="true";el.setAttribute("aria-busy","true");el.textContent="Working…";
    if(id!=="updateStatus")el.disabled=true;
    try{await fn()}finally{
      el.textContent=label;el.removeAttribute("aria-busy");delete el.dataset.kcWorking;
      // Update-order can become permanently disabled after its final status.
      if(id!=="updateStatus")el.disabled=wasDisabled;
    }
  });
}

if(role==="customer"){
bind("loadShops",async()=>{const data=await api("/api/shops","GET",null,true);option($("shop"),data.shops,x=>x.name+" — "+x.area);out(data.shops.length+" approved shops")});
$("shop").onchange=safe(async()=>{const id=$("shop").value;if(!id)return;const data=await api("/api/shops/"+encodeURIComponent(id)+"/menu","GET",null,true);menu=data.items;option($("item"),menu,x=>x.name+" — R"+(x.price_cents/100).toFixed(2));cart=[];requestId=null;$("cart").textContent="Cart empty";out(data.items.length+" menu items")});
bind("addCart",async()=>{const item=menu.find(x=>x.id===$("item").value),quantity=Number($("quantity").value);if(!item||!Number.isInteger(quantity)||quantity<1||quantity>50)throw Error("Select a menu item and quantity");const current=cart.find(x=>x.itemId===item.id);if(current){if(current.quantity+quantity>50)throw Error("Maximum 50 per item");current.quantity+=quantity}else cart.push({itemId:item.id,quantity});requestId=null;$("cart").textContent=cart.map(x=>{const m=menu.find(i=>i.id===x.itemId);return m.name+" × "+x.quantity}).join(", ");out("Added to cart")});
bind("clearCart",async()=>{cart=[];requestId=null;$("cart").textContent="Cart empty";out("Cart cleared")});
let checkoutGps=null;
const checkoutGpsButton=document.createElement("button");
checkoutGpsButton.type="button";
checkoutGpsButton.textContent="Use my current location";
const checkoutGpsStatus=document.createElement("span");
checkoutGpsStatus.setAttribute("role","status");
$("address").after(checkoutGpsButton,checkoutGpsStatus);
function refreshCheckoutGps(){
 const delivery=$("fulfillment").value==="delivery";
 checkoutGpsButton.hidden=!delivery;checkoutGpsStatus.hidden=!delivery;
 if(!delivery){checkoutGps=null;checkoutGpsStatus.textContent="";}
}
$("fulfillment").addEventListener("change",refreshCheckoutGps);
$("address").addEventListener("input",()=>{checkoutGps=null;checkoutGpsStatus.textContent="";});
checkoutGpsButton.onclick=safe(async()=>{
 checkoutGps=null;checkoutGpsButton.disabled=true;
 try{checkoutGps=await captureDeliveryLocation();checkoutGpsStatus.textContent="Delivery location captured.";}
 finally{checkoutGpsButton.disabled=false;}
});
refreshCheckoutGps();
const codChoice=document.createElement("input");codChoice.type="checkbox";
const codLabel=document.createElement("label");codLabel.append(codChoice,document.createTextNode(" I choose cash on delivery"));
$("address").after(codLabel);
function updateCodChoice(){codLabel.hidden=$("fulfillment").value!=="delivery";if(codLabel.hidden)codChoice.checked=false;}
$("fulfillment").addEventListener("change",updateCodChoice);updateCodChoice();
$("checkout").onsubmit=e=>{e.preventDefault();safe(async()=>{if($("fulfillment").value==="delivery"&&!codChoice.checked)throw Error("Select cash on delivery first.");if(!requestId)requestId=crypto.randomUUID();const data=await api("/api/orders","POST",{requestId,shopId:$("shop").value,items:cart.length?cart:[{itemId:$("item").value,quantity:Number($("quantity").value)}],customerName:$("customerName").value,customerPhone:$("customerPhone").value,area:$("area").value,fulfillmentType:$("fulfillment").value,deliveryAddress:$("address").value,paymentMethod:$("fulfillment").value==="delivery"&&codChoice.checked?"cash_on_delivery":null,deliveryLocation:$("fulfillment").value==="delivery"?checkoutGps:null});requestId=null;codChoice.checked=false;checkoutGps=null;checkoutGpsStatus.textContent="";cart=[];$("cart").textContent="Cart empty";$("orderId").value=data.order.id;rememberTrackedOrder(data.order.id);await refreshCustomerTracking(false);out(data)})()};
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
    if(order.fulfillment_type==="delivery"){
      try{
        const data=await api("/api/orders/"+encodeURIComponent(id)+"/delivery");
        if($("orderId").value.trim()!==id)return;
        const labels={searching:"Finding a driver",assigned:"Driver assigned",ready:"Ready for collection",collected:"Collected by driver",enroute:"Out for delivery",delivered:"Delivered",cancelled:"Delivery cancelled",failed:"Delivery failed"};
        const deliveryStatus=data.delivery?.status;
        if(Object.hasOwn(labels,deliveryStatus))$("trackingStatus").textContent="Order "+order.order_number+" — "+labels[deliveryStatus];
        else if(order.status==="ready_for_collection")$("trackingStatus").textContent="Order "+order.order_number+" — Ready; driver request not yet confirmed";
      }catch{if($("orderId").value.trim()===id)$("trackingStatus").textContent+=" — Live driver status unavailable";}
    }
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
const shopDialog=$("manageShopDialog");
$("manageShopButton")?.addEventListener("click",()=>{
  if(!dashboardAccess)return out("Sign in with an approved shop-owner account to manage your shop.");
  if(!shopDialog?.open)shopDialog.showModal();
  $("myShops")?.click();
});
$("closeManageShop")?.addEventListener("click",()=>shopDialog?.close());
shopDialog?.addEventListener("click",event=>{if(event.target===shopDialog)shopDialog.close()});
let menuLoadedShop="",menuSnapshot="";
const menuUrl=shopId=>"/api/owner/shops/"+encodeURIComponent(shopId)+"/menu";
const menuFingerprint=items=>JSON.stringify(items.map(item=>[item.id,item.name,item.price_cents,item.available]));
async function ownerMenu(shopId){const data=await api(menuUrl(shopId));if(!Array.isArray(data.items))throw Error("Unable to read shop menu");return data.items}
const weightPanel=document.createElement("div");
$("menuText").after(weightPanel);
function renderMenuWeights(shopId,items){
 weightPanel.replaceChildren();
 for(const item of items.filter(x=>x.available)){
  const row=document.createElement("div"),label=document.createElement("label"),input=document.createElement("input"),button=document.createElement("button");
  label.textContent=item.name+" packaged weight (g) ";input.type="number";input.min="1";input.max="100000";input.step="1";input.value=item.weight_grams??"";
  label.append(input);button.type="button";button.textContent="Save weight";
  button.onclick=safe(async()=>{if($("shop").value!==shopId)throw Error("Reload the selected shop menu.");const weightGrams=Number(input.value);if(!Number.isInteger(weightGrams)||weightGrams<1||weightGrams>100000)throw Error("Enter a valid packaged weight in grams.");button.disabled=true;try{await api(menuUrl(shopId)+"/"+encodeURIComponent(item.id)+"/weight","PATCH",{weightGrams});out("Packaged weight saved.");}finally{button.disabled=false;}});
  row.append(label,button);weightPanel.append(row);
 }
}
$("shop").addEventListener("change",()=>weightPanel.replaceChildren());
async function viewOwnerMenu(){
  const shopId=required("shop","Shop"),items=await ownerMenu(shopId);
  menuLoadedShop=shopId;menuSnapshot=menuFingerprint(items);
  $("menuText").value=formatMenuText(items);renderMenuWeights(shopId,items);
  out("Loaded "+items.filter(item=>item.available).length+" available menu items. Edit the text and press Save menu and prices.");
}
$("shop").addEventListener("change",()=>{menuLoadedShop="";menuSnapshot="";$("menuText").value="";});
bind("apply",async()=>out(await api("/api/shop-applications","POST",{ownerName:$("ownerName").value,shopName:$("shopName").value,phone:$("phone").value,area:$("area").value,address:$("address").value,description:$("description").value})));
async function submitPendingShopApplication(){
 const raw=localStorage.getItem("kc_pending_shop_application");if(!raw)return;
 const pending=JSON.parse(raw);if(pending.email.toLowerCase()!==String((await auth.getSession()).data?.user?.email||"").toLowerCase())return;
 const response=await api("/api/shop-applications","POST",pending.application);
 localStorage.removeItem("kc_pending_shop_application");
 out("Shop application submitted successfully. Application status: "+response.application.status+". You can manage your application from the dashboard.");
}

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
if($("saveShopDetails")){
 const locationButton=document.createElement("button");
 locationButton.type="button";locationButton.textContent="Save shop location";
 $("saveShopDetails").after(locationButton);
 locationButton.onclick=safe(async()=>{
   const id=$("shop").value;if(!id)throw new Error("Select your shop first.");
   locationButton.disabled=true;
   try{const location=await captureDeliveryLocation();await api("/api/owner/shops/"+encodeURIComponent(id)+"/pickup-location","PATCH",location);out("Shop pickup location saved.");}
   finally{locationButton.disabled=false;}
 });
}
bind("saveShopDetails",async()=>{
  const id=required("shop","Shop");
  const body={name:required("editShopName","Shop name"),area:required("editShopArea","Shop area"),phone:required("editShopPhone","Shop phone"),address:$("editShopAddress").value.trim()};
  const result=await api("/api/owner/shops/"+encodeURIComponent(id),"PATCH",body);
  const index=editableShops.findIndex(s=>s.id===id);if(index>=0)editableShops[index]={...editableShops[index],...result.shop};
  const selected=$("shop").selectedIndex;if(selected>=0)$("shop").options[selected].textContent=result.shop.name;
  out("Shop details saved. Approved status and existing orders were not changed.");
});

bind("myShops",async()=>{const selected=$("shop").value;const r=await api("/api/owner/shops");editableShops=Array.isArray(r.shops)?r.shops:[];option($("shop"),editableShops,x=>x.name);if(editableShops.some(shop=>shop.id===selected))$("shop").value=selected;else if(editableShops.length===1)$("shop").value=editableShops[0].id;showEditableShop();menuLoadedShop="";menuSnapshot="";$("menuText").value="";out(editableShops.length+" shops found. Select your shop and press View menu.");});
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
let deliveryDispatchEnabled=false,deliveryProofEnabled=false;
const pickupProof=mountDeliveryProof({after:$("orderItems"),label:"Show driver pickup code",purpose:"collection",currentOrder:()=>$("orderId").value.trim(),request:id=>api("/api/owner/orders/"+encodeURIComponent(id)+"/delivery-verification","POST",{})});
clearOwnerProof=()=>pickupProof.update("",false);
const deliveryButton=document.createElement("button");
deliveryButton.type="button";deliveryButton.textContent="Request bicycle delivery";deliveryButton.hidden=true;
deliveryButton.setAttribute("aria-label","Request bicycle delivery for selected ready order");
$("orderItems").after(deliveryButton);
deliveryButton.onclick=safe(async()=>{
  if(deliveryButton.disabled)return;
  const id=$("orderId").value.trim();deliveryButton.disabled=true;
  try{const result=await api("/api/owner/orders/"+encodeURIComponent(id)+"/delivery","POST",{});out(result.delivery?.queued?"Delivery queued: no courier assignment confirmed.":result);}
  finally{updateOwnerOrderSelection();}
});
const allowedOwnerTransitions={
  pending:["accepted","rejected","delayed"],
  accepted:["preparing","delayed","rejected"],
  preparing:["ready_for_collection","out_for_delivery","delayed"],
  delayed:["accepted","rejected"],
  ready_for_collection:["completed"],
  out_for_delivery:["completed"]
};
function nextOwnerStatuses(order){
  return (allowedOwnerTransitions[order.status]||[]).filter(value=>
    value!=="ready_for_collection"||["pickup","delivery"].includes(order.fulfillment_type)
  ).filter(value=>value!=="out_for_delivery"&&(order.fulfillment_type!=="delivery"||value!=="completed"));
}
function updateOwnerOrderSelection(){
  const id=$("orderId").value.trim();
  const selected=ownerOrders.find(order=>order.id===id);
  const dropdown=$("ownerOrderSelect");
  dropdown.value=selected?.id||"";
  const allowed=selected?nextOwnerStatuses(selected):[];
  pickupProof.update(id,dashboardAccess&&deliveryProofEnabled&&selected?.fulfillment_type==="delivery"&&selected?.status==="ready_for_collection");
  deliveryButton.hidden=!deliveryDispatchEnabled;
  deliveryButton.disabled=!deliveryDispatchEnabled||selected?.fulfillment_type!=="delivery"||!["ready_for_collection","out_for_delivery"].includes(selected?.status);
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
  deliveryDispatchEnabled=false;
  try{const capabilities=await api("/api/owner/delivery-capabilities");deliveryDispatchEnabled=capabilities.dispatch_enabled===true;deliveryProofEnabled=capabilities.verification_enabled===true;}catch{deliveryProofEnabled=false;}
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
    const approveCashOnDelivery=status==="ready_for_collection"&&selected.fulfillment_type==="delivery";
    if(approveCashOnDelivery&&!window.confirm("Approve cash on delivery and request a driver for this test order?"))return;
    const saved=await api("/api/owner/orders/"+encodeURIComponent(id)+"/status","PATCH",{status,note:$("note").value,approveCashOnDelivery});
    // Confirm the saved status from Neon instead of displaying the dropdown as if it succeeded.
    const verified=await api("/api/orders/"+encodeURIComponent(id));
    if(verified.order?.status!==status)throw Error("The API did not confirm the status change. Refresh orders before retrying.");
    await loadOwnerOrders(false);
    await pollNotifications(true);
    if(approveCashOnDelivery){out(saved.dispatchAccepted===true?"COD approved. Delivery request accepted; check tracking for driver assignment.":"Order status saved. Delivery dispatch not confirmed. Check tracking and retry dispatch.");return;}
    out("Status saved: "+verified.order.order_number+" — "+status.replaceAll("_"," ")+". Customer tracking will reflect this saved status.");
  }finally{
    updateOwnerOrderSelection();
  }
});
}
if(role==="admin"){
const pendingShopDecisions=new Map();
clearAdminShopDecisions=()=>pendingShopDecisions.clear();
function newAdminRequestId(){
  if(crypto.randomUUID)return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");return hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
}
async function loadAdminOverview(){
  const revision=adminShopRevision;
  const data=await api("/api/admin/overview");
  if(revision!==adminShopRevision||!dashboardAccess)return;
  $("registeredShops").textContent=String(data.shopCount);
  $("approvedShops").textContent=String(data.approvedShopCount);
  $("pendingApplications").textContent=String((data.applications||[]).find(x=>x.status==="pending")?.count||0);
  $("commissionDue").textContent=data.commissionPaused?"Paused for launch":"R"+(data.estimatedCommissionCents/100).toFixed(2);
  $("commissionCollected").textContent=data.commissionPaused?"Not collected during launch":(data.collectedCommissionCents===null?"Not yet verifiable":"R"+(data.collectedCommissionCents/100).toFixed(2));
  $("commissionNotice").textContent=data.commissionCollectionStatus||"Commission collection reports require confirmed payment records.";
  let managementAvailable=false;
  try{managementAvailable=(await api("/api/admin/shop-management")).available===true}catch{/* Existing dashboards remain usable before management activation. */}
  if(revision!==adminShopRevision||!dashboardAccess)return;
  const list=$("adminShopList");list.replaceChildren();
  for(const shop of data.shops||[]){
    const entry=document.createElement("div");entry.style.cssText="border:1px solid #d8e6dc;border-radius:12px;padding:12px";
    const title=document.createElement("strong");title.textContent=shop.name+" — "+(shop.approved?"Approved":"Not approved");
    const address=document.createElement("p");address.textContent=[shop.area,shop.address,shop.phone].filter(Boolean).join(" · ");
    entry.append(title,address);
    if(managementAvailable){
      const action=document.createElement("button");action.type="button";
      action.textContent=pendingShopDecisions.has(shop.id)?"Retry decision":shop.approved?"Suspend shop":"Restore approval";
      action.setAttribute("aria-label",action.textContent+" for "+shop.name);
      action.onclick=safe(async()=>{
        if(revision!==adminShopRevision||!dashboardAccess)return;
        let decision=pendingShopDecisions.get(shop.id);
        if(!decision){
          const reason=window.prompt((shop.approved?"Suspend":"Restore approval for")+" "+shop.name+". Enter the reason (required):");
          if(reason===null)return;
          if(!reason.trim()||reason.length>500)throw Error("Enter a reason between 1 and 500 characters.");
          decision={requestId:newAdminRequestId(),approved:!shop.approved,expectedCurrentApproved:shop.approved,reason:reason.trim()};pendingShopDecisions.set(shop.id,decision);
        }
        action.disabled=true;
        try{
          await api("/api/admin/shops/"+encodeURIComponent(shop.id)+"/approval","PATCH",decision);
          if(revision!==adminShopRevision||!dashboardAccess)return;
          pendingShopDecisions.delete(shop.id);await loadAdminOverview();out("Shop decision recorded. Dashboard refreshed from the saved state.");
        }catch(error){
          if(error.status>=400&&error.status<500){pendingShopDecisions.delete(shop.id);await loadAdminOverview().catch(()=>{});}
          throw error;
        }finally{if(action.isConnected){action.disabled=false;action.textContent=pendingShopDecisions.has(shop.id)?"Retry decision":shop.approved?"Suspend shop":"Restore approval";action.setAttribute("aria-label",action.textContent+" for "+shop.name);}}
      });
      const historyButton=document.createElement("button");historyButton.type="button";historyButton.textContent="Approval history";historyButton.setAttribute("aria-label","View approval history for "+shop.name);
      const history=document.createElement("div");history.setAttribute("role","status");
      historyButton.onclick=safe(async()=>{
        const result=await api("/api/admin/shops/"+encodeURIComponent(shop.id)+"/approval-events");
        if(revision!==adminShopRevision||!dashboardAccess)return;
        history.replaceChildren();
        for(const event of result.events||[]){const text=document.createElement("p");text.textContent=new Date(event.created_at).toLocaleString()+" — "+(event.approved?"Approved":"Suspended")+" — "+event.reason+" — "+event.actor_subject;history.append(text);}
        if(!history.childNodes.length)history.textContent="No approval history recorded yet.";
      });
      entry.append(action,historyButton,history);
    }
    list.append(entry);
  }
  out("Administrator dashboard loaded. Registered shops: "+data.shopCount);
}
bind("adminOverview",loadAdminOverview);
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
const formatAdminMoney=cents=>Number.isFinite(Number(cents))?"R"+(Number(cents)/100).toFixed(2):"—";
const formatAdminDate=value=>{
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"Date unavailable":date.toLocaleString("en-ZA",{dateStyle:"medium",timeStyle:"short"});
};
function renderAdminOrders(orders){
  const list=$("adminOrderList");
  list.replaceChildren();
  if(!orders.length){
    const empty=document.createElement("p");empty.className="section-hint";
    empty.textContent="There are no customer orders yet.";
    list.append(empty);return;
  }
  for(const order of orders){
    const card=document.createElement("article");card.className="admin-order-card";card.setAttribute("role","listitem");
    const header=document.createElement("div");header.className="admin-order-header";
    const heading=document.createElement("h3");heading.textContent=String(order.order_number||"Order");
    const state=document.createElement("span");state.className="admin-order-status";
    state.dataset.state=String(order.status||"pending");state.textContent=String(order.status||"pending").replaceAll("_"," ");
    header.append(heading,state);
    const meta=document.createElement("p");meta.className="admin-order-meta";
    meta.textContent=[String(order.shop_name||"Shop not specified"),formatAdminDate(order.created_at)].join(" · ");
    const fields=document.createElement("dl");fields.className="admin-order-fields";
    const pairs=[
      ["Customer",order.customer_name||"Not provided"],
      ["Order total",formatAdminMoney(order.total_cents)],
      ["Collection / delivery",order.fulfillment_type==="pickup"?"Collection":order.fulfillment_type==="delivery"?"Delivery":"Not specified"],
      ["Area",order.area||"Not specified"]
    ];
    for(const [label,value] of pairs){
      const pair=document.createElement("div");
      const term=document.createElement("dt");term.textContent=label;
      const detail=document.createElement("dd");detail.textContent=String(value);
      pair.append(term,detail);fields.append(pair);
    }
    const detailButton=document.createElement("button");
    detailButton.type="button";detailButton.className="secondary";
    detailButton.textContent="View order items";
    detailButton.setAttribute("aria-expanded","false");
    const detailPanel=document.createElement("div");detailPanel.className="admin-order-items";detailPanel.hidden=true;
    detailButton.onclick=safe(async()=>{
      if(!detailPanel.hidden){
        detailPanel.hidden=true;detailButton.textContent="View order items";detailButton.setAttribute("aria-expanded","false");return;
      }
      detailButton.disabled=true;detailButton.textContent="Loading items…";
      try{
        const response=await api("/api/orders/"+encodeURIComponent(order.id)+"/items");
        const items=Array.isArray(response.items)?response.items:[];
        detailPanel.replaceChildren();
        const title=document.createElement("strong");title.textContent="Items in this order";
        detailPanel.append(title);
        const ul=document.createElement("ul");
        for(const item of items){
          const li=document.createElement("li");
          li.textContent=String(item.item_name||item.name||"Menu item")+" × "+String(item.quantity||1)+" · "+formatAdminMoney(item.unit_price_cents??item.price_cents);
          ul.append(li);
        }
        if(!items.length){const empty=document.createElement("p");empty.textContent="No line items available.";detailPanel.append(empty)}
        else detailPanel.append(ul);
        detailPanel.hidden=false;
        detailButton.setAttribute("aria-expanded","true");
      }finally{
        detailButton.disabled=false;
        detailButton.textContent=detailPanel.hidden?"View order items":"Hide order items";
      }
    });
    card.append(header,meta,fields,detailButton,detailPanel);list.append(card);
  }
}
loadAdminOrders=async function(announce=true){
  const response=await api("/api/admin/orders");
  const orders=Array.isArray(response.orders)?response.orders:[];
  renderAdminOrders(orders);
  $("adminOrderCount").textContent=orders.length+" recent order"+(orders.length===1?"":"s")+" · Live Neon records";
  if(announce)out("Orders loaded: "+orders.length+(orders.length?" · "+orders.map(item=>item.order_number).filter(Boolean).join(", "):""));
};
bind("orders",async()=>loadAdminOrders(true));
const money=cents=>"R"+(Number(cents||0)/100).toFixed(2);
loadAdminCommission=async function(announce=true){
  const data=await api("/api/admin/commission");
  if(data.commissionPaused!==true||data.rateCents!==50)throw Error("Unexpected commission configuration; no collection actions are allowed.");
  const estimate=money(data.estimatedCommissionCents);
  $("commissionPreviewAmount").textContent=estimate;
  $("commissionEstimate").textContent=estimate;
  $("commissionEligible").textContent=String(data.eligibleCompletedOrders);
  $("commissionRemaining").textContent=money(data.remainingToThresholdCents);
  $("commissionStatus").textContent="Collection paused · Forecast only · "+data.excludedTestOrders+" completed test order(s) excluded.";
  const list=$("commissionShopList");list.replaceChildren();
  const active=(Array.isArray(data.shops)?data.shops:[]).filter(shop=>shop.eligibleOrders>0);
  if(!active.length){
    const empty=document.createElement("p");empty.className="section-hint";
    empty.textContent="No completed, non-test orders yet. Commission estimates will appear here.";
    list.append(empty);
  }
  for(const shop of active){
    const row=document.createElement("div");row.className="commission-shop-row";
    const name=document.createElement("strong");name.textContent=String(shop.shopName||"Shop");
    const details=document.createElement("span");details.textContent=String(shop.eligibleOrders)+" completed order(s)";
    const amount=document.createElement("b");amount.textContent=money(shop.estimatedCommissionCents);
    row.append(name,details,amount);list.append(row);
  }
  if(announce)out("Commission estimates refreshed. No commissions have been charged or collected.");
};
bind("refreshCommission",async()=>loadAdminCommission(true));
const commissionDialog=$("commissionDialog");
$("openCommission")?.addEventListener("click",()=>{
  if(!dashboardAccess)return out("Administrator sign-in required to see commissions.");
  if(!commissionDialog.open)commissionDialog.showModal();
  loadAdminCommission(false).catch(error=>out("Unable to load commission: "+error.message));
});
$("closeCommission")?.addEventListener("click",()=>commissionDialog.close());
commissionDialog?.addEventListener("click",event=>{if(event.target===commissionDialog)commissionDialog.close()});
}
// The server returns only this signed-in user's most recent notifications (read and unread).
// Render them inside Notifications rather than dumping JSON into the Activity panel.
const readableNotificationDate=value=>{
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"Date unavailable":date.toLocaleString("en-ZA",{dateStyle:"medium",timeStyle:"short"});
};
function readableNotificationBody(n){
  const body=String(n.body||"").trim();
  if(n.kind==="order_status"&&/^[a-z_]+$/.test(body))return "Order status: "+body.replaceAll("_"," ");
  if(n.kind==="application_status"&&/^(approved|rejected|pending)$/.test(body))return "Your shop application was "+body+".";
  return body||"No further details.";
}
function renderNotifications(notifications){
  const list=$("notificationList");if(!list)return;
  list.replaceChildren();
  if(!notifications.length){
    const empty=document.createElement("p");empty.textContent="No notifications yet. New orders and account updates will appear here.";
    list.append(empty);return;
  }
  for(const notification of notifications){
    const card=document.createElement("article");card.className="notification-card";
    card.dataset.unread=String(!notification.read_at);card.setAttribute("role","listitem");
    const title=document.createElement("h3");title.textContent=String(notification.title||"Kota Connect notification");
    const body=document.createElement("p");body.className="notification-body";body.textContent=readableNotificationBody(notification);
    const meta=document.createElement("p");meta.className="notification-meta";
    meta.textContent=[notification.order_number?"Order "+notification.order_number:null,notification.shop_name||null,readableNotificationDate(notification.created_at)].filter(Boolean).join(" · ");
    const state=document.createElement("p");state.className="notification-status";
    state.textContent=notification.read_at?"Read":"Unread";
    card.append(title,body,meta,state);
    if(!notification.read_at){
      const button=document.createElement("button");button.type="button";button.textContent="Mark as read";
      button.setAttribute("aria-label","Mark "+title.textContent+" as read");
      button.onclick=safe(async()=>markNotificationRead(notification.id));
      card.append(button);
    }
    list.append(card);
  }
}
let notificationRequest=null;
let currentNotifications=[],notificationRevision=0,notificationMutationPending=false;
function displayNotifications(notifications){
  currentNotifications=notifications;
  renderNotifications(notifications);
  const unread=notifications.filter(n=>!n.read_at).length;
  if($("unread"))$("unread").textContent=notifications.length+" notification"+(notifications.length===1?"":"s")+" · "+unread+" unread";
  if($("openNotifications"))$("openNotifications").textContent="🔔 Notifications"+(unread?" ("+unread+" new)":"");
  if($("openDashboardNotifications"))$("openDashboardNotifications").textContent="View notifications"+(unread?" ("+unread+" new)":"");
  const bulk=$("markAllRead");
  if(bulk){bulk.disabled=!notifications.length||notificationMutationPending;bulk.textContent=notificationMutationPending?"Saving…":"Mark all as read";}
}
async function pollNotifications(force=false){
  if(role==="customer"||!dashboardAccess||notificationMutationPending||!force&&document.visibilityState!=="visible")return currentNotifications;
  if(notificationRequest){try{await notificationRequest}catch{}if(!force||notificationMutationPending)return currentNotifications}
  const revision=notificationRevision;
  const task=(async()=>{
    try{
      const response=await api("/api/notifications");
      if(!dashboardAccess||notificationMutationPending||revision!==notificationRevision)return currentNotifications;
      const notifications=Array.isArray(response.notifications)?response.notifications:[];
      displayNotifications(notifications);
      return notifications;
    }catch(error){
      if(dashboardAccess&&!notificationMutationPending&&revision===notificationRevision)$("unread").textContent="Unable to refresh notifications. Tap Refresh notifications to retry.";
      if(force)throw error;
      return currentNotifications;
    }
  })();
  notificationRequest=task;
  try{return await task}finally{if(notificationRequest===task)notificationRequest=null}
}
async function commitNotificationReads(path,matching,success){
  if(notificationMutationPending)return;
  notificationMutationPending=true;notificationRevision++;
  const previous=currentNotifications;
  const now=new Date().toISOString();
  displayNotifications(previous.map(n=>matching(n)?{...n,read_at:n.read_at||now}:n));
  try{
    const result=await api(path,"PATCH");
    out(success+(result.updated===undefined?"":" ("+result.updated+" updated)"));
  }catch(error){
    displayNotifications(previous);
    throw error;
  }finally{
    notificationMutationPending=false;
    displayNotifications(currentNotifications);
    pollNotifications(true).catch(error=>out("Unable to refresh notifications: "+error.message));
  }
}
async function markNotificationRead(id){
  if(!orderIdPattern.test(id))throw Error("Choose a valid notification.");
  return commitNotificationReads("/api/notifications/"+encodeURIComponent(id)+"/read",n=>n.id===id,"Notification marked as read.");
}
async function markAllNotificationsRead(){
  if(!currentNotifications.length)return out("No notifications to mark as read.");
  return commitNotificationReads("/api/notifications/read-all",()=>true,"All notifications marked as read.");
}
const ordersDialog=$("customerOrdersDialog");
$("openCustomerOrders")?.addEventListener("click",()=>{
  if(!dashboardAccess)return out("Sign in to open customer orders.");
  if(!ordersDialog.open)ordersDialog.showModal();
  const refresh=role==="admin"?loadAdminOrders:loadOwnerOrders;
  refresh(false).catch(error=>out("Unable to refresh orders: "+error.message));
});
$("closeCustomerOrders")?.addEventListener("click",()=>ordersDialog.close());
ordersDialog?.addEventListener("click",event=>{if(event.target===ordersDialog)ordersDialog.close()});
const notificationsDialog=$("notificationsPanel");
function openNotificationsDialog(){
  if(!dashboardAccess){
    out("Sign in with your approved "+(role==="owner"?"shop-owner":"administrator")+" account to view notifications.");
    $("accountPanel").scrollIntoView({behavior:"smooth",block:"start"});
    return;
  }
  if(!notificationsDialog.open)notificationsDialog.showModal();
  pollNotifications(true).catch(error=>out("Unable to refresh notifications: "+error.message));
}
const shortcut=$("openNotifications");
if(shortcut)shortcut.addEventListener("click",openNotificationsDialog);
$("openDashboardNotifications")?.addEventListener("click",openNotificationsDialog);
$("closeNotifications")?.addEventListener("click",()=>notificationsDialog.close());
notificationsDialog?.addEventListener("click",event=>{if(event.target===notificationsDialog)notificationsDialog.close()});
bind("notifications",async()=>{
  const items=await pollNotifications(true);
  out("Notifications updated. "+items.length+" message"+(items.length===1?"":"s")+" shown in Notifications.");
});
bind("markRead",async()=>markNotificationRead(required("notificationId","Notification ID")));
$("markAllRead")?.addEventListener("click",()=>markAllNotificationsRead().catch(error=>out("Error: "+error.message)));
showIdentity().then(async()=>{
  if(role==="owner"&&dashboardAccess)await loadOwnerOrders(false);
  if(role==="admin"&&dashboardAccess){await loadAdminOrders(false);await loadAdminCommission(false);}
  if(role==="customer")await refreshCustomerTracking(false);
  await pollNotifications(true);
}).catch(()=>{});
setInterval(()=>pollNotifications(false).catch(()=>{}),10000);
setInterval(()=>{if(role==="owner"&&dashboardAccess&&document.visibilityState==="visible")loadOwnerOrders(false).catch(()=>{})},10000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){pollNotifications(true).catch(()=>{});if(role==="owner"&&dashboardAccess)loadOwnerOrders(false).catch(()=>{})}});
window.addEventListener("focus",()=>{pollNotifications(true).catch(()=>{})});
