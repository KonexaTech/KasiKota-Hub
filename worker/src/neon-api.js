import { verifiedNeonSubject, isNeonAdmin } from "./neon-auth.js";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses=["pending","accepted","preparing","ready_for_collection","out_for_delivery","completed","rejected","delayed"];
const next={pending:["accepted","rejected"],accepted:["preparing","delayed","rejected"],preparing:["ready_for_collection","out_for_delivery","delayed"],delayed:["accepted","preparing","ready_for_collection","out_for_delivery","rejected"],ready_for_collection:["completed"],out_for_delivery:["completed"]};
async function readBody(request){try{return await request.json()}catch{return null}}
export async function neonApi(request,env,withDb){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(!path.startsWith("/api/"))return null;
  const subject=await verifiedNeonSubject(request,env);
  if(method==="GET"&&path==="/api/shops")return json({shops:(await withDb(env,async db=>(await db.query("SELECT id,name,area,address,phone FROM kc_shops WHERE approved=true ORDER BY name LIMIT 100")).rows))});
  const menu=/^\/api\/shops\/([0-9a-f-]{36})\/menu$/.exec(path);
  if(method==="GET"&&menu&&uuid.test(menu[1]))return json({items:await withDb(env,async db=>(await db.query("SELECT m.id,m.name,m.price_cents FROM kc_menu_items m JOIN kc_shops s ON s.id=m.shop_id WHERE s.approved=true AND m.available=true AND m.shop_id=$1 ORDER BY m.name LIMIT 100",[menu[1]])).rows)});
  if(!subject)return json({error:"Sign in with Neon Auth"},401);
  if(method==="GET"&&path==="/api/me")return json({subject,admin:await isNeonAdmin(env,withDb,subject)});
  if(method==="GET"&&path==="/api/orders/mine")return json({orders:await withDb(env,async db=>(await db.query("SELECT id,order_number,shop_id,status,total_cents,created_at FROM kc_orders WHERE customer_subject=$1 ORDER BY created_at DESC LIMIT 100",[subject])).rows)});
  if(method==="GET"&&path==="/api/owner/orders")return json({orders:await withDb(env,async db=>(await db.query("SELECT o.id,o.order_number,o.shop_id,o.status,o.customer_name,o.area,o.fulfillment_type,o.total_cents,o.created_at FROM kc_orders o JOIN kc_shops s ON s.id=o.shop_id WHERE s.owner_subject=$1 ORDER BY o.created_at DESC LIMIT 100",[subject])).rows)});
  if(method==="GET"&&path==="/api/admin/orders"){if(!await isNeonAdmin(env,withDb,subject))return json({error:"Admin access required"},403);return json({orders:await withDb(env,async db=>(await db.query("SELECT o.id,o.order_number,o.shop_id,s.name AS shop_name,o.status,o.created_at,o.total_cents FROM kc_orders o JOIN kc_shops s ON s.id=o.shop_id ORDER BY o.created_at DESC LIMIT 200")).rows)})}
  const track=/^\/api\/orders\/([0-9a-f-]{36})$/.exec(path);
  if(method==="GET"&&track&&uuid.test(track[1])){const order=await withDb(env,async db=>(await db.query("SELECT o.id,o.order_number,o.shop_id,o.customer_subject,o.customer_name,o.area,o.fulfillment_type,o.status,o.total_cents,o.owner_note,o.delay_minutes,o.created_at,s.owner_subject FROM kc_orders o JOIN kc_shops s ON s.id=o.shop_id WHERE o.id=$1",[track[1]])).rows[0]);if(!order)return json({error:"Order not found"},404);if(order.customer_subject!==subject&&order.owner_subject!==subject&&!await isNeonAdmin(env,withDb,subject))return json({error:"Forbidden"},403);delete order.customer_subject;delete order.owner_subject;return json({order})}
  if(method==="POST"&&path==="/api/orders"){
    const data=await readBody(request);
    if(!data||!uuid.test(data.shopId||"")||!Array.isArray(data.items)||!data.items.length||data.items.length>30||!["pickup","delivery"].includes(data.fulfillmentType)||typeof data.customerName!=="string"||data.customerName.trim().length<2||data.customerName.length>100||typeof data.customerPhone!=="string"||data.customerPhone.length>30||typeof data.area!=="string"||data.area.length>160||data.fulfillmentType==="delivery"&&(!data.deliveryAddress||data.deliveryAddress.length>300))return json({error:"Invalid checkout"},400);
    if(data.items.some(x=>!uuid.test(x.itemId||"")||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>50))return json({error:"Invalid items"},400);
    const result=await withDb(env,async db=>{await db.query("BEGIN");try{
      const shop=(await db.query("SELECT id,owner_subject FROM kc_shops WHERE id=$1 AND approved=true",[data.shopId])).rows[0];if(!shop)throw Error("SHOP");
      const ids=data.items.map(x=>x.itemId);if(new Set(ids).size!==ids.length)throw Error("ITEMS");
      const rows=(await db.query("SELECT id,name,price_cents FROM kc_menu_items WHERE shop_id=$1 AND available=true AND id=ANY($2::uuid[])",[data.shopId,ids])).rows;
      if(rows.length!==ids.length)throw Error("ITEMS");
      const prices=new Map(rows.map(x=>[x.id,x]));let subtotal=0;for(const item of data.items)subtotal+=prices.get(item.itemId).price_cents*item.quantity;
      if(!Number.isSafeInteger(subtotal)||subtotal>100000000)throw Error("ITEMS");
      const delivery=data.fulfillmentType==="delivery"?1500:0;
      const number="KC-"+crypto.randomUUID().slice(0,12).toUpperCase();
      const order=(await db.query("INSERT INTO kc_orders(order_number,shop_id,customer_subject,customer_name,customer_phone,area,delivery_address,fulfillment_type,subtotal_cents,delivery_cents,total_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,order_number,status,total_cents",[number,data.shopId,subject,data.customerName.trim(),data.customerPhone.trim(),data.area.trim(),data.deliveryAddress||null,data.fulfillmentType,subtotal,delivery,subtotal+delivery])).rows[0];
      for(const item of data.items){const p=prices.get(item.itemId);await db.query("INSERT INTO kc_order_items(order_id,menu_item_id,item_name,unit_price_cents,quantity) VALUES($1,$2,$3,$4,$5)",[order.id,p.id,p.name,p.price_cents,item.quantity])}
      await db.query("INSERT INTO kc_order_status_events(order_id,previous_status,new_status,actor_subject,actor_role) VALUES($1,NULL,'pending',$2,'customer')",[order.id,subject]);
      await db.query("INSERT INTO kc_notifications(recipient_subject,order_id,kind,title,body) VALUES($1,$2,'new_order','New Kota Connect order','A customer placed an order')",[shop.owner_subject,order.id]);
      await db.query("COMMIT");return order;
    }catch(e){await db.query("ROLLBACK");throw e}});
    return json({order:result},201);
  }
  const statusRoute=/^\/api\/owner\/orders\/([0-9a-f-]{36})\/status$/.exec(path);
  if(method==="PATCH"&&statusRoute&&uuid.test(statusRoute[1])){
    const body=await readBody(request);if(!body||!statuses.includes(body.status)||typeof(body.note||"")!=="string"||String(body.note||"").length>500)return json({error:"Invalid status"},400);
    const result=await withDb(env,async db=>{await db.query("BEGIN");try{const row=(await db.query("SELECT o.id,o.status,o.fulfillment_type,o.customer_subject FROM kc_orders o JOIN kc_shops s ON s.id=o.shop_id WHERE o.id=$1 AND s.owner_subject=$2 FOR UPDATE OF o",[statusRoute[1],subject])).rows[0];if(!row){await db.query("ROLLBACK");return null}if(!(next[row.status]||[]).includes(body.status)||body.status==="ready_for_collection"&&row.fulfillment_type!=="pickup"||body.status==="out_for_delivery"&&row.fulfillment_type!=="delivery"){await db.query("ROLLBACK");return false}await db.query("UPDATE kc_orders SET status=$1,owner_note=$2,updated_at=now() WHERE id=$3",[body.status,body.note||"",row.id]);await db.query("INSERT INTO kc_order_status_events(order_id,previous_status,new_status,actor_subject,actor_role,note) VALUES($1,$2,$3,$4,'owner',$5)",[row.id,row.status,body.status,subject,body.note||""]);await db.query("INSERT INTO kc_notifications(recipient_subject,order_id,kind,title,body) VALUES($1,$2,'order_status','Order status updated',$3)",[row.customer_subject,row.id,body.status]);await db.query("COMMIT");return true}catch(e){await db.query("ROLLBACK");throw e}});
    return result===null?json({error:"Order not found"},404):result===false?json({error:"Invalid status transition"},409):json({ok:true});
  }
  return json({error:"Not found"},404);
}
