import { createAuthClient } from "https://esm.sh/@neon/auth@latest";
const AUTH_URL="https://ep-lively-leaf-za5rtfhs.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth";
const auth=createAuthClient(AUTH_URL);
const $=id=>document.getElementById(id), role=document.body.dataset.role;
const API="https://kota-connect-api-dev.siboniisozulu.workers.dev";
let requestId=null,menu=[],cart=[];
let dashboardAccess=false;
function showDashboardPanels(allowed){dashboardAccess=Boolean(allowed);document.querySelectorAll('[data-restricted-panel]').forEach(panel=>{panel.hidden=!dashboardAccess})}
const out=(message)=>{$("result").textContent=typeof message==="string"?message:JSON.stringify(message,null,2)};
const safe=(fn)=>async()=>{try{await fn()}catch(e){out("Error: "+e.message)}};
async function apiJwt(){
  let token=null;
  if(typeof auth.getJWTToken==="function"){
    try{token=await auth.getJWTToken()}catch{} // The public client may instead expose token().
  }
  if(!token){
    const r=await auth.token();
    if(r.error)throw Error(r.error.message);
    token=r.data?.token;
  }
  // Only a signed JWT is valid for the Worker. Never send a session-cookie ID.
  if(typeof token!=="string"||token.split(".").length!==3){
    const session=await auth.getSession();
    if(session.error)throw Error(session.error.message);
    if(!session.data?.user)throw Error("Sign in to continue");
    throw Error("Neon did not issue an API access token. Verify your email, sign out, then sign in again.");
  }
  return token;
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
$("signin").addEventListener("submit",e=>{e.preventDefault();safe(async()=>{const r=await auth.signIn.email({email:$("email").value,password:$("password").value});if(r.error)throw Error(r.error.message);if(!r.data)throw Error("Sign-in did not return an account");await showIdentity();if(role==="owner"&&!dashboardAccess)throw Error("Administrator accounts cannot sign in as shop owners. Sign out and use another owner account.");if(role==="admin"&&!dashboardAccess)throw Error("This account is not authorized as an administrator.");out(role==="admin"?"Signed in. Administrator access verified.":"Signed in")})()});
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
$("checkout").onsubmit=e=>{e.preventDefault();safe(async()=>{if(!requestId)requestId=crypto.randomUUID();const data=await api("/api/orders","POST",{requestId,shopId:$("shop").value,items:cart.length?cart:[{itemId:$("item").value,quantity:Number($("quantity").value)}],customerName:$("customerName").value,customerPhone:$("customerPhone").value,area:$("area").value,fulfillmentType:$("fulfillment").value,deliveryAddress:$("address").value});requestId=null;cart=[];$("cart").textContent="Cart empty";$("orderId").value=data.order.id;out(data)})()};
bind("myOrders",async()=>out(await api("/api/orders/mine")));
bind("track",async()=>out(await api("/api/orders/"+encodeURIComponent($("orderId").value))));
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
