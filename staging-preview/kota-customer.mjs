import { findShops, quoteCents, areas } from "./shop-discovery.mjs";
const $=id=>document.getElementById(id);
const SESSION_KEY="kota_connect_guest_checkout_v1",ORDER_KEY="kota_connect_last_tracked_order_id";
let shops=[],shop=null,menu=[],selectedItem=null,requestId=null,tracking=false,menuLoadSequence=0;
const money=cents=>"R"+(Number(cents||0)/100).toFixed(2);
function error(message){$("errorMessage").textContent=message;$("errorMessage").hidden=false;$("errorMessage").scrollIntoView({block:"nearest"});}
function clearError(){$("errorMessage").hidden=true;$("errorMessage").textContent="";}
function jump(id){$(id).scrollIntoView({behavior:"smooth",block:"start"});}
function token(){
  let value;
  try{value=localStorage.getItem(SESSION_KEY)}catch{throw Error("Enable browser storage to safely track your orders.")}
  if(!/^[a-f0-9]{64}$/.test(value||"")){
    const bytes=crypto.getRandomValues(new Uint8Array(32));
    value=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
    try{localStorage.setItem(SESSION_KEY,value)}catch{throw Error("Enable browser storage to place a guest order.")}
  }
  return value;
}
async function api(path,{method="GET",body,publicRoute=false}={}){
  const headers={"accept":"application/json"};
  if(!publicRoute)headers.authorization="Guest "+token();
  if(body)headers["content-type"]="application/json";
  let response;
  try{response=await fetch("/api"+path,{method,headers,body:body?JSON.stringify(body):undefined,cache:"no-store"})}
  catch{throw Error("Kota Connect cannot reach the server. Check your connection and try again.")}
  let data;
  try{data=await response.json()}catch{throw Error("The server returned an invalid response.")}
  if(!response.ok)throw Error(data?.error || ("Server error "+response.status));
  return data;
}
const action=(id,handler)=>$(id).addEventListener("click",async()=>{
  const button=$(id);
  if(button.dataset.kcWorking==="true")return;
  clearError();
  const previous=button.textContent;
  button.dataset.kcWorking="true";button.disabled=true;button.setAttribute("aria-busy","true");button.textContent="Working…";
  try{await handler()}catch(e){error(e.message)}
  finally{button.textContent=previous;button.disabled=false;button.removeAttribute("aria-busy");delete button.dataset.kcWorking}
});
async function loadShops(){
  $("shopCount").textContent="Looking for approved kota shops…";
  const data=await api("/shops",{publicRoute:true});
  shops=Array.isArray(data.shops)?data.shops:[];
  showShops();
}
function showShops(){
  const matches=findShops(shops,$("area").value,$("shopSearch").value);
  const areaLabel=areas.find(x=>x.value===$("area").value)?.label||"your area";
  $("shopCount").textContent=matches.length+" approved shop"+(matches.length===1?"":"s")+" found"+($("area").value==="all"?"":" in "+areaLabel)+".";
  const list=$("shopResults");list.replaceChildren();
  if(!matches.length){const p=document.createElement("p");p.textContent="No approved shops match yet. Choose another area or try a different shop name.";list.append(p);return}
  for(const entry of matches){
    const card=document.createElement("div");card.className="shop-card";
    const info=document.createElement("div"),title=document.createElement("strong"),meta=document.createElement("small"),open=document.createElement("button");
    title.textContent=entry.name;meta.textContent=[entry.area,entry.address].filter(Boolean).join(" · ");info.append(title,meta);
    open.textContent="View menu →";open.type="button";open.addEventListener("click",()=>chooseShop(entry).catch(e=>error(e.message)));
    card.append(info,open);list.append(card);
  }
}
async function chooseShop(entry){
  clearError();const sequence=++menuLoadSequence;
  shop=entry;selectedItem=null;requestId=null;$("confirmStep").hidden=true;
  $("menuStep").hidden=false;$("selectedShop").textContent=entry.name+" · "+(entry.area||"Newcastle");
  $("menuItems").replaceChildren();const wait=document.createElement("p");wait.textContent="Loading prices…";$("menuItems").append(wait);
  jump("menuStep"); // Show the next step immediately; never wait for network before responding to a tap.
  try{
    const data=await api("/shops/"+encodeURIComponent(entry.id)+"/menu",{publicRoute:true});
    if(sequence!==menuLoadSequence)return; // An older slow response must not replace the newer shop.
    menu=Array.isArray(data.items)?data.items:[];$("menuItems").replaceChildren();
    if(!menu.length){const empty=document.createElement("p");empty.textContent="This shop has not published a menu yet."; $("menuItems").append(empty);}
    for(const item of menu){
      const card=document.createElement("div");card.className="menu-card";
      const title=document.createElement("strong");title.textContent=item.name;
      const button=document.createElement("button");button.type="button";button.textContent=money(item.price_cents)+" →";button.setAttribute("aria-label","Choose "+item.name+" for "+money(item.price_cents));
      button.addEventListener("click",()=>chooseItem(item));
      card.append(title,button);$("menuItems").append(card);
    }
  }catch(e){if(sequence!==menuLoadSequence)return;$("menuStep").hidden=true;throw e}
}
function chooseItem(item){
  clearError();selectedItem=item;requestId=null;
  $("chosenItem").textContent=shop.name+" — "+item.name+" ("+money(item.price_cents)+" each)";
  $("confirmStep").hidden=false;$("quantity").value="1";updateQuote();jump("confirmStep");
}
function updateQuote(){
  if(!selectedItem)return;
  try{$("orderTotal").textContent="Estimated total: "+money(quoteCents(selectedItem.price_cents,Number($("quantity").value),$("fulfillment").value))}
  catch{$("orderTotal").textContent="Choose a valid quantity (1–50).";}
  $("deliveryAddressPanel").hidden=$("fulfillment").value!=="delivery";
  $("address").required=$("fulfillment").value==="delivery";
}
async function trackOrder(announce=true){
  const id=$("orderId").value.trim();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)){if(announce)throw Error("Enter a valid order ID to track.");return}
  if(tracking)return;tracking=true;
  try{
    const response=await api("/orders/"+encodeURIComponent(id));
    const record=response.order;
    if(!record?.status)throw Error("Could not load this order.");
    $("trackingStatus").textContent="Order "+record.order_number+": "+record.status.replaceAll("_"," ")+(record.owner_note?" — "+record.owner_note:"");
    $("trackingChecked").textContent="Updated "+new Date().toLocaleTimeString()+". Checking every 10 seconds while this page is open.";
    try{localStorage.setItem(ORDER_KEY,id)}catch{}
    if(announce)jump("trackStep");
  }catch(e){$("trackingChecked").textContent="Tracking could not update: "+e.message;if(announce)throw e}
  finally{tracking=false}
}
$("proceed").addEventListener("click",()=>jump("browse"));
action("loadShops",loadShops);
$("area").addEventListener("change",()=>{clearError();showShops()});
$("shopSearch").addEventListener("input",showShops);
$("quantity").addEventListener("input",updateQuote);
$("fulfillment").addEventListener("change",updateQuote);
$("checkout").addEventListener("submit",async event=>{
  event.preventDefault();clearError();
  if(!shop||!selectedItem){error("Choose a shop and tap a menu price first.");return}
  if($("paymentMethod").value!=="cash"){error("Online payments are not available yet.");return}
  const submit=$("confirmOrder"),label=submit.innerHTML;
  submit.disabled=true;submit.setAttribute("aria-busy","true");submit.textContent="Sending order…";
  $("successMessage").textContent="Submitting your order securely…";
  try{
    const quantity=Number($("quantity").value);
    quoteCents(selectedItem.price_cents,quantity,$("fulfillment").value);
    if(!requestId)requestId=crypto.randomUUID();
    const body={requestId,shopId:shop.id,items:[{itemId:selectedItem.id,quantity}],
      customerName:$("customerName").value.trim(),customerPhone:$("customerPhone").value.trim(),
      area:areas.find(x=>x.value===$("area").value)?.label||"Newcastle",
      fulfillmentType:$("fulfillment").value,deliveryAddress:$("address").value.trim()};
    if(!body.customerName||!body.customerPhone)throw Error("Enter your name and cellphone number.");
    if(body.fulfillmentType==="delivery"&&!body.deliveryAddress)throw Error("Enter your delivery address.");
    if(body.area==="All Newcastle areas")body.area=shop.area||"Newcastle";
    const data=await api("/orders",{method:"POST",body});
    const id=data?.order?.id;if(!id)throw Error("The server did not confirm an order ID.");
    $("orderId").value=id;try{localStorage.setItem(ORDER_KEY,id)}catch{}
    $("successMessage").textContent="Order "+data.order.order_number+" received. "+money(data.order.total_cents)+" is payable in cash when collecting or receiving your order. No online payment has been taken.";
    requestId=null;$("confirmStep").hidden=true;
    await trackOrder(false);jump("trackStep");
  }catch(e){error(e.message)}
  finally{submit.disabled=false;submit.removeAttribute("aria-busy");submit.innerHTML=label}
});
action("track",()=>trackOrder(true));
try{const id=localStorage.getItem(ORDER_KEY);if(id)$("orderId").value=id;const area=localStorage.getItem("kota_connect_area");if(areas.some(x=>x.value===area))$("area").value=area;}catch{}
$("area").addEventListener("change",()=>{try{localStorage.setItem("kota_connect_area",$("area").value)}catch{}});
setInterval(()=>{if(document.visibilityState==="visible")trackOrder(false).catch(()=>{})},10000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")trackOrder(false).catch(()=>{})});
loadShops().catch(e=>{error(e.message);$("shopCount").textContent="Could not load shops."});
if($("orderId").value)trackOrder(false).catch(()=>{});
