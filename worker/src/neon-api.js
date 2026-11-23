import { verifiedNeonSubject, isNeonAdmin } from "./neon-auth.js";
import { isOwnerOnlyRoute } from "./role-policy.js";
import { guestRouteAllowed, verifiedGuestSubject } from "./guest-auth.js";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses=["pending","accepted","preparing","ready_for_collection","out_for_delivery","completed","rejected","delayed"];
const next={pending:["accepted","rejected","delayed"],accepted:["preparing","delayed","rejected"],preparing:["ready_for_collection","out_for_delivery","delayed"],delayed:["accepted","rejected"],ready_for_collection:["completed"],out_for_delivery:["completed"]};
async function readBody(request){try{return await request.json()}catch{return null}}
export async function neonApi(request,env,withDb){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(!path.startsWith("/api/"))return null;
  if(method==="GET"&&path==="/api/health"){try{const db=await withDb(env,async c=>(await c.query("SELECT 1 AS ok")).rows[0]);return json({ok:db?.ok===1,backend:"neon",authConfigured:Boolean(env.NEON_AUTH_URL||env.NEON_AUTH_BASE_URL),sourceCommit:typeof env.KOTA_SOURCE_COMMIT==="string"&&/^[0-9a-f]{40}$/.test(env.KOTA_SOURCE_COMMIT)?env.KOTA_SOURCE_COMMIT:null})}catch(e){const code=typeof e?.code==="string"&&/^[A-Z0-9_]{2,12}$/.test(e.code)?e.code:"UNKNOWN";return json({ok:false,backend:"neon",database:"unavailable",errorCode:code,errorType:typeof e?.name==="string"?e.name.slice(0,50):"Unknown",phase: /connect|socket|network|fetch|timeout|tls|ssl/i.test(String(e?.message||""))?"connection":"database",diagnostic: /Database target does not match development branch/i.test(String(e?.message||""))?"wrong_database_target":/Expected development database host not configured/i.test(String(e?.message||""))?"missing_target_guard":/Invalid database connection URL/i.test(String(e?.message||""))?"invalid_database_url":/Database binding not configured/i.test(String(e?.message||""))?"missing_binding":/password authentication failed/i.test(String(e?.message||""))?"authentication":/getaddrinfo|ENOTFOUND|dns/i.test(String(e?.message||""))?"dns":/certificate|tls|ssl/i.test(String(e?.message||""))?"tls":/timeout|ETIMEDOUT/i.test(String(e?.message||""))?"timeout":/connect|socket|network|fetch/i.test(String(e?.message||""))?"network":"unclassified"},503)}}
  // Guest credentials can access customer order routes only.

  // Allow no-account customers only on explicitly listed customer routes.
  // Owner/admin routes still require a signed Neon JWT.
  const bearerSubject=await verifiedNeonSubject(request,env);
  const subject=bearerSubject ||
    (guestRouteAllowed(method,path)?await verifiedGuestSubject(request):null);
  if(method==="GET"&&path==="/api/shops")return json({shops:(await withDb(env,async db=>(await db.query("SELECT id,name,area,address,phone FROM kc_shops WHERE approved=true ORDER BY name LIMIT 100")).rows))});
  const menu=/^\/api\/shops\/([0-9a-f-]{36})\/menu$/.exec(path);
  if(method==="GET"&&menu&&uuid.test(menu[1]))return json({items:await withDb(env,async db=>(await db.query("SELECT m.id,m.name,m.price_cents FROM kc_menu_items m JOIN kc_shops s ON s.id=m.shop_id WHERE s.approved=true AND m.available=true AND m.shop_id=$1 ORDER BY m.name LIMIT 100",[menu[1]])).rows)});
  if(!subject)return json({error:"Sign in with Neon Auth"},401);
  if(!subject.startsWith("guest:")){
    const account=await withDb(env,async db=>(await db.query(
      'SELECT "emailVerified" AS email_verified, COALESCE(banned,false) AS banned, ("banExpires" IS NULL OR "banExpires" > now()) AS ban_active FROM neon_auth."user" WHERE id=$1',
      [subject]
    )).rows[0]);
    if(!account||account.email_verified!==true)return json({error:"Email verification required. Verify your email before continuing."},403);
    if(account.banned&&account.ban_active)return json({error:"Account is suspended."},403);
  }
  // Admin accounts must never act as shop owners, even by calling the API directly.
  if(isOwnerOnlyRoute(path)&&await isNeonAdmin(env,withDb,subject))return json({error:"Administrator accounts cannot use shop-owner functions. Sign in using a separate owner account."},403);
  if(path.startsWith("/api/owner/")&&path!=="/api/owner/access"){
    const approved=await withDb(env,async db=>(await db.query("SELECT 1 FROM kc_shops WHERE owner_subject=$1 AND approved=true LIMIT 1",[subject])).rowCount===1);
    if(!approved)return json({error:"Shop owner access is locked until an administrator approves your application."},403);
  }
  if(method==="GET"&&path==="/api/owner/access"){
    const access=await withDb(env,async db=>{
      const shop=(await db.query("SELECT 1 FROM kc_shops WHERE owner_subject=$1 AND approved=true LIMIT 1",[subject])).rowCount===1;
      const application=(await db.query("SELECT status FROM kc_shop_applications WHERE applicant_subject=$1 ORDER BY created_at DESC LIMIT 1",[subject])).rows[0];
      return {approved:shop,applicationStatus:application?.status||null};
    });
    return json(access);
  }
  if(method==="GET"&&path==="/api/me")return json({subject,admin:await isNeonAdmin(env,withDb,subject)});
  if(method==="GET"&&path==="/api/orders/mine")return json({orders:await withDb(env,async db=>(await db.query("SELECT id,order_number,shop_id,status,total_cents,created_at FROM kc_orders WHERE customer_subject=$1 ORDER BY created_at DESC LIMIT 100",[subject])).rows)});
  if(method==="GET"&&path==="/api/owner/shops")return json({shops:await withDb(env,async db=>(await db.query("SELECT id,name,area,address,phone,approved FROM kc_shops WHERE owner_subject=$1 ORDER BY created_at DESC LIMIT 50",[subject])).rows)});
  const shopEdit=/^\/api\/owner\/shops\/([0-9a-f-]{36})$/.exec(path);
  if(method==="PATCH"&&shopEdit&&uuid.test(shopEdit[1])){
    const d=await readBody(request);
    if(!d||!["name","area","phone","address"].every(key=>typeof d[key]==="string")||
      !d.name.trim()||d.name.length>160||!d.area.trim()||d.area.length>160||
      !d.phone.trim()||d.phone.length>30||d.address.length>300)
      return json({error:"Invalid shop details"},400);
    const changed=await withDb(env,async db=>db.query(
      "UPDATE kc_shops SET name=$3,area=$4,phone=$5,address=$6 WHERE id=$1 AND owner_subject=$2 RETURNING id,name,area,phone,address,approved",
      [shopEdit[1],subject,d.name.trim(),d.area.trim(),d.phone.trim(),d.address.trim()]));
    return changed.rowCount?json({shop:changed.rows[0]}):json({error:"Shop not found or not owned"},404);
  }
  const ownMenu=/^\/api\/owner\/shops\/([0-9a-f-]{36})\/menu$/.exec(path);
  if(ownMenu&&uuid.test(ownMenu[1])){
    if(method==="GET")return json({items:await withDb(env,async db=>(await db.query("SELECT m.id,m.name,m.price_cents,m.available FROM kc_menu_items m JOIN kc_shops s ON s.id=m.shop_id WHERE s.id=$1 AND s.owner_subject=$2 ORDER BY m.name LIMIT 200",[ownMenu[1],subject])).rows)});
    if(method==="POST"){const d=await readBody(request);if(!d||typeof d.name!=="string"||!d.name.trim()||d.name.length>160||!Number.isInteger(d.priceCents)||d.priceCents<1||d.priceCents>10000000)return json({error:"Invalid menu item"},400);const result=await withDb(env,async db=>db.query("INSERT INTO kc_menu_items(shop_id,name,price_cents) SELECT id,$3,$4 FROM kc_shops WHERE id=$1 AND owner_subject=$2 AND approved=true RETURNING id,name,price_cents,available",[ownMenu[1],subject,d.name.trim(),d.priceCents]));return result.rowCount?json({item:result.rows[0]},201):json({error:"Shop not owned or approved"},403)}
  }
  const ownItem=/^\/api\/owner\/shops\/([0-9a-f-]{36})\/menu\/([0-9a-f-]{36})$/.exec(path);
  if(method==="PATCH"&&ownItem&&uuid.test(ownItem[1])&&uuid.test(ownItem[2])){const d=await readBody(request);if(!d||typeof d.name!=="string"||!d.name.trim()||d.name.length>160||!Number.isInteger(d.priceCents)||d.priceCents<1||d.priceCents>10000000||typeof d.available!=="boolean")return json({error:"Invalid menu update"},400);const result=await withDb(env,async db=>db.query("UPDATE kc_menu_items m SET name=$4,price_cents=$5,available=$6 FROM kc_shops s WHERE m.id=$3 AND m.shop_id=s.id AND s.id=$1 AND s.owner_subject=$2 AND s.approved=true RETURNING m.id,m.name,m.price_cents,m.available",[ownItem[1],subject,ownItem[2],d.name.trim(),d.priceCents,d.available]));return result.rowCount?json({item:result.rows[0]}):json({error:"Menu item not found"},404)}
  if(method==="GET"&&path==="/api/owner/orders")return json({orders:await withDb(env,async db=>(await db.query("SELECT o.id,o.order_number,o.shop_id,o.status,o.customer_name,o.area,o.fulfillment_type,o.total_cents,o.created_at FROM kc_orders o JOIN kc_shops s ON s.id=o.shop_id WHERE s.owner_subject=$1 ORDER BY o.created_at DESC LIMIT 100",[subject])).rows)});
  if(method==="GET"&&path==="/api/admin/overview"){
    if(!await isNeonAdmin(env,withDb,subject))return json({error:"Admin access required"},403);
    return json(await withDb(env,async db=>{
      const shops=(await db.query("SELECT id,name,area,address,phone,approved,created_at FROM kc_shops ORDER BY created_at DESC LIMIT 500")).rows;
      const applications=(await db.query("SELECT status,count(*)::int AS count FROM kc_shop_applications GROUP BY status")).rows;
      const totals=(await db.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE approved=true)::int AS approved FROM kc_shops")).rows[0];
        return {shops,shopCount:totals.total,approvedShopCount:totals.approved,
          applications,commissionPaused:true,estimatedCommissionCents:0,
          collectedCommissionCents:null,commissionCollectionStatus:"Commission is paused for launch. No commission is charged or collected."};
    }));
  }
  if(method==="GET"&&path==="/api/admin/commission"){
    if(!await isNeonAdmin(env,withDb,subject))return json({error:"Admin access required"},403);
    return json(await withDb(env,async db=>{
      const rateCents=50,thresholdCents=2000;
      // Estimates only. A completed non-test order qualifies; no payments or collection are triggered.
      const totals=(await db.query("SELECT count(*) FILTER (WHERE status='completed' AND test_order IS NOT TRUE)::int AS eligible_orders, count(*) FILTER (WHERE status='completed' AND test_order IS TRUE)::int AS excluded_test_orders FROM kc_orders")).rows[0];
      const shops=(await db.query("SELECT s.id AS shop_id,s.name AS shop_name,count(o.id) FILTER (WHERE o.status='completed' AND o.test_order IS NOT TRUE)::int AS eligible_orders FROM kc_shops s LEFT JOIN kc_orders o ON o.shop_id=s.id GROUP BY s.id,s.name ORDER BY eligible_orders DESC,s.name ASC LIMIT 500")).rows;
      const eligibleCompletedOrders=Number(totals.eligible_orders)||0;
      const estimatedCommissionCents=eligibleCompletedOrders*rateCents;
      return {
        commissionPaused:true,collectionStatus:"Paused for private testing. Estimates are not collected payments.",
        rateCents,thresholdCents,eligibleCompletedOrders,
        excludedTestOrders:Number(totals.excluded_test_orders)||0,
        estimatedCommissionCents,
        remainingToThresholdCents:Math.max(0,thresholdCents-estimatedCommissionCents),
        thresholdReached:estimatedCommissionCents>=thresholdCents,
        collectedCommissionCents:null,
        shops:shops.map(shop=>({
          shopId:shop.shop_id,shopName:shop.shop_name,
          eligibleOrders:Number(shop.eligible_orders)||0,
          estimatedCommissionCents:(Number(shop.eligible_orders)||0)*rateCents
        }))
      };
    }));
  }
  if(method==="GET"&&path==="/api/admin/orders"){if(!await isNeonAdmin(env,withDb,subject))return json({error:"Admin access required"},403);return json({orders:await withDb(env,async db=>(await db.query("SELECT o.id,o.order_number,o.shop_id,s.name AS shop_name,o.status,o.created_at,o.total_cents,o.customer_name,o.area,o.fulfillment_type FROM kc_orders o JOIN kc_shops s ON s.id=o.shop_id ORDER BY o.created_at DESC LIMIT 200")).rows)})}
  if(method==="GET"&&path==="/api/notifications")return json({notifications:await withDb(env,async db=>(await db.query("SELECT n.id,n.order_id,n.kind,n.title,n.body,n.read_at,n.created_at,o.order_number,s.name AS shop_name FROM kc_notifications n LEFT JOIN kc_orders o ON o.id=n.order_id LEFT JOIN kc_shops s ON s.id=o.shop_id WHERE n.recipient_subject=$1 ORDER BY n.created_at DESC LIMIT 100",[subject])).rows)});
  // Bulk read is one atomic, recipient-scoped UPDATE. Never trust a recipient ID from the client.
  if(method==="PATCH"&&path==="/api/notifications/read-all"){
    if(subject.startsWith("guest:"))return json({error:"Signed-in account required"},403);
    const result=await withDb(env,async db=>db.query(
      "WITH marked AS (UPDATE kc_notifications SET read_at=now() WHERE recipient_subject=$1 AND read_at IS NULL RETURNING 1) SELECT count(*)::int AS updated FROM marked",
      [subject]
    ));
    return json({ok:true,updated:Number(result.rows?.[0]?.updated)||0});
  }
  const readNotification=/^\/api\/notifications\/([0-9a-f-]{36})\/read$/.exec(path);
  if(method==="PATCH"&&readNotification&&uuid.test(readNotification[1])){const result=await withDb(env,async db=>db.query("UPDATE kc_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND recipient_subject=$2 RETURNING id",[readNotification[1],subject]));return result.rowCount?json({ok:true}):json({error:"Notification not found"},404)}
  if(method==="POST"&&path==="/api/shop-applications"){const d=await readBody(request);if(!d||typeof d.ownerName!=="string"||d.ownerName.trim().length<2||d.ownerName.length>120||typeof d.shopName!=="string"||d.shopName.trim().length<2||d.shopName.length>160||typeof d.phone!=="string"||!d.phone.trim()||d.phone.length>30||typeof d.area!=="string"||!d.area.trim()||d.area.length>160||typeof d.address!=="string"||!d.address.trim()||d.address.length>300||typeof(d.description||"")!=="string"||String(d.description||"").length>2000)return json({error:"Invalid shop application"},400);const result=await withDb(env,async db=>{
    await db.query("BEGIN");
    try{
      const inserted=await db.query("INSERT INTO kc_shop_applications(applicant_subject,owner_name,shop_name,phone,area,address,description) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status,created_at",[subject,d.ownerName.trim(),d.shopName.trim(),d.phone.trim(),d.area.trim(),d.address.trim(),d.description||""]);
      await db.query("INSERT INTO kc_notifications(recipient_subject,kind,title,body) SELECT subject,'application_status','New shop application',$1 FROM kc_admins",[d.shopName.trim()+" — "+d.area.trim()]);
      await db.query("COMMIT");
      return inserted;
    }catch(error){await db.query("ROLLBACK");throw error}
  });return json({application:result.rows[0]},201)}
  if(method==="GET"&&path==="/api/shop-applications/mine")return json({applications:await withDb(env,async db=>(await db.query("SELECT id,shop_name,area,status,created_at,reviewed_at FROM kc_shop_applications WHERE applicant_subject=$1 ORDER BY created_at DESC LIMIT 50",[subject])).rows)});
  if(method==="GET"&&path==="/api/admin/shop-applications"){if(!await isNeonAdmin(env,withDb,subject))return json({error:"Admin access required"},403);return json({applications:await withDb(env,async db=>(await db.query("SELECT id,applicant_subject,owner_name,shop_name,phone,area,address,description,status,created_at FROM kc_shop_applications ORDER BY created_at DESC LIMIT 200")).rows)})}
  const review=/^\/api\/admin\/shop-applications\/([0-9a-f-]{36})\/review$/.exec(path);
  if(method==="PATCH"&&review&&uuid.test(review[1])){if(!await isNeonAdmin(env,withDb,subject))return json({error:"Admin access required"},403);const d=await readBody(request);if(!d||!["approved","rejected"].includes(d.status))return json({error:"Invalid decision"},400);const result=await withDb(env,async db=>{await db.query("BEGIN");try{const application=(await db.query("SELECT id,applicant_subject,shop_name,phone,area,address,status FROM kc_shop_applications WHERE id=$1 FOR UPDATE",[review[1]])).rows[0];if(!application||application.status!=="pending"){await db.query("ROLLBACK");return null}if(d.status==="approved")await db.query("INSERT INTO kc_shops(owner_subject,name,area,address,phone,approved) VALUES($1,$2,$3,$4,$5,true)",[application.applicant_subject,application.shop_name,application.area,application.address,application.phone]);await db.query("UPDATE kc_shop_applications SET status=$1,reviewed_by_subject=$2,reviewed_at=now() WHERE id=$3",[d.status,subject,application.id]);await db.query("INSERT INTO kc_notifications(recipient_subject,kind,title,body) VALUES($1,'application_status','Shop application reviewed',$2)",[application.applicant_subject,d.status]);await db.query("COMMIT");return true}catch(e){await db.query("ROLLBACK");throw e}});return result?json({ok:true}):json({error:"Application not pending"},409)}
  const track=/^\/api\/orders\/([0-9a-f-]{36})$/.exec(path);
  if(method==="GET"&&track&&uuid.test(track[1])){const order=await withDb(env,async db=>(await db.query("SELECT o.id,o.order_number,o.shop_id,o.customer_subject,o.customer_name,o.area,o.fulfillment_type,o.status,o.total_cents,o.owner_note,o.delay_minutes,o.created_at,s.owner_subject FROM kc_orders o JOIN kc_shops s ON s.id=o.shop_id WHERE o.id=$1",[track[1]])).rows[0]);if(!order)return json({error:"Order not found"},404);if(order.customer_subject!==subject&&order.owner_subject!==subject&&!await isNeonAdmin(env,withDb,subject))return json({error:"Forbidden"},403);delete order.customer_subject;delete order.owner_subject;return json({order})}
  const details=/^\/api\/orders\/([0-9a-f-]{36})\/items$/.exec(path);
  if(method==="GET"&&details&&uuid.test(details[1])){
    const order=await withDb(env,async db=>(await db.query("SELECT o.customer_subject,s.owner_subject FROM kc_orders o JOIN kc_shops s ON s.id=o.shop_id WHERE o.id=$1",[details[1]])).rows[0]);
    if(!order)return json({error:"Order not found"},404);
    if(order.customer_subject!==subject&&order.owner_subject!==subject&&!await isNeonAdmin(env,withDb,subject))return json({error:"Forbidden"},403);
    return json({items:await withDb(env,async db=>(await db.query("SELECT item_name,unit_price_cents,quantity FROM kc_order_items WHERE order_id=$1 ORDER BY id LIMIT 100",[details[1]])).rows)});
  }
  const history=/^\/api\/orders\/([0-9a-f-]{36})\/history$/.exec(path);
  if(method==="GET"&&history&&uuid.test(history[1])){const order=await withDb(env,async db=>(await db.query("SELECT o.customer_subject,s.owner_subject FROM kc_orders o JOIN kc_shops s ON s.id=o.shop_id WHERE o.id=$1",[history[1]])).rows[0]);if(!order)return json({error:"Order not found"},404);if(order.customer_subject!==subject&&order.owner_subject!==subject&&!await isNeonAdmin(env,withDb,subject))return json({error:"Forbidden"},403);return json({events:await withDb(env,async db=>(await db.query("SELECT previous_status,new_status,actor_role,note,created_at FROM kc_order_status_events WHERE order_id=$1 ORDER BY created_at,id LIMIT 200",[history[1]])).rows)})}
  if(method==="POST"&&path==="/api/orders"){
    const data=await readBody(request);
    if(!data||typeof data.requestId!=="string"||!uuid.test(data.requestId)||typeof data.shopId!=="string"||!uuid.test(data.shopId)||!Array.isArray(data.items)||!data.items.length||data.items.length>30||!["pickup","delivery"].includes(data.fulfillmentType)||typeof data.customerName!=="string"||data.customerName.trim().length<2||data.customerName.length>100||typeof data.customerPhone!=="string"||!data.customerPhone.trim()||data.customerPhone.length>30||typeof data.area!=="string"||!data.area.trim()||data.area.length>160||data.deliveryAddress!=null&&(typeof data.deliveryAddress!=="string"||data.deliveryAddress.length>300)||data.fulfillmentType==="delivery"&&(typeof data.deliveryAddress!=="string"||!data.deliveryAddress.trim()))return json({error:"Invalid checkout"},400);
    if(data.items.some(x=>!x||typeof x.itemId!=="string"||!uuid.test(x.itemId)||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>50))return json({error:"Invalid items"},400);
    // PostgreSQL uuid values are canonical lowercase. Use the same representation
    // for price lookup, duplicate detection and replay comparison after validation.
    data.requestId=data.requestId.toLowerCase();
    data.shopId=data.shopId.toLowerCase();
    data.items=data.items.map(item=>({itemId:item.itemId.toLowerCase(),quantity:item.quantity}));
    try {const result=await withDb(env,async db=>{await db.query("BEGIN");try{
      const existing=(await db.query("SELECT id,order_number,status,total_cents,shop_id,customer_name,customer_phone,area,delivery_address,fulfillment_type FROM kc_orders WHERE customer_subject=$1 AND client_request_id=$2",[subject,data.requestId])).rows[0];if(existing){const lines=(await db.query("SELECT menu_item_id AS id,quantity FROM kc_order_items WHERE order_id=$1",[existing.id])).rows;const matches=existing.shop_id===data.shopId&&existing.customer_name===data.customerName.trim()&&existing.customer_phone===data.customerPhone.trim()&&existing.area===data.area.trim()&&existing.fulfillment_type===data.fulfillmentType&&(existing.delivery_address||"")===(data.deliveryAddress||"")&&lines.length===data.items.length&&data.items.every(x=>lines.some(y=>y.id===x.itemId&&y.quantity===x.quantity));if(!matches)throw Error("REQUEST_REUSED");await db.query("COMMIT");return {order:existing,replayed:true}}
      const shop=(await db.query("SELECT id,owner_subject FROM kc_shops WHERE id=$1 AND approved=true FOR SHARE",[data.shopId])).rows[0];if(!shop)throw Error("SHOP");
      const ids=data.items.map(x=>x.itemId);if(new Set(ids).size!==ids.length)throw Error("ITEMS");
      const rows=(await db.query("SELECT id,name,price_cents FROM kc_menu_items WHERE shop_id=$1 AND available=true AND id=ANY($2::uuid[])",[data.shopId,ids])).rows;
      if(rows.length!==ids.length)throw Error("ITEMS");
      const prices=new Map(rows.map(x=>[x.id,x]));let subtotal=0;for(const item of data.items)subtotal+=prices.get(item.itemId).price_cents*item.quantity;
      if(!Number.isSafeInteger(subtotal)||subtotal>100000000)throw Error("ITEMS");
      const delivery=data.fulfillmentType==="delivery"?500:0;
      const testOrder=url.hostname==="kota-connect-api-dev.siboniisozulu.workers.dev";
      const number="KC-"+crypto.randomUUID().slice(0,12).toUpperCase();
      const order=(await db.query("INSERT INTO kc_orders(order_number,shop_id,customer_subject,customer_name,customer_phone,area,delivery_address,fulfillment_type,subtotal_cents,delivery_cents,total_cents,test_order,client_request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (customer_subject,client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING RETURNING id,order_number,status,total_cents",[number,data.shopId,subject,data.customerName.trim(),data.customerPhone.trim(),data.area.trim(),data.deliveryAddress||null,data.fulfillmentType,subtotal,delivery,subtotal+delivery,testOrder,data.requestId])).rows[0];
      if(!order){const replay=(await db.query("SELECT id,order_number,status,total_cents,shop_id,customer_name,customer_phone,area,delivery_address,fulfillment_type FROM kc_orders WHERE customer_subject=$1 AND client_request_id=$2",[subject,data.requestId])).rows[0];if(!replay)throw Error("REQUEST_REUSED");const lines=(await db.query("SELECT menu_item_id AS id,quantity FROM kc_order_items WHERE order_id=$1",[replay.id])).rows;const matches=replay.shop_id===data.shopId&&replay.customer_name===data.customerName.trim()&&replay.customer_phone===data.customerPhone.trim()&&replay.area===data.area.trim()&&replay.fulfillment_type===data.fulfillmentType&&(replay.delivery_address||"")===(data.deliveryAddress||"")&&lines.length===data.items.length&&data.items.every(x=>lines.some(y=>y.id===x.itemId&&y.quantity===x.quantity));if(!matches)throw Error("REQUEST_REUSED");await db.query("COMMIT");return {order:replay,replayed:true}}
      for(const item of data.items){const p=prices.get(item.itemId);await db.query("INSERT INTO kc_order_items(order_id,menu_item_id,item_name,unit_price_cents,quantity) VALUES($1,$2,$3,$4,$5)",[order.id,p.id,p.name,p.price_cents,item.quantity])}
      await db.query("INSERT INTO kc_order_status_events(order_id,previous_status,new_status,actor_subject,actor_role) VALUES($1,NULL,'pending',$2,'customer')",[order.id,subject]);
      await db.query("INSERT INTO kc_notifications(recipient_subject,order_id,kind,title,body) VALUES($1,$2,'new_order','New Kota Connect order',$3)",[shop.owner_subject,order.id,"Order "+order.order_number+" placed by "+data.customerName.trim()]);
      await db.query("INSERT INTO kc_notifications(recipient_subject,order_id,kind,title,body) SELECT subject,$1,'new_order','New Kota Connect order',$2 FROM kc_admins WHERE subject<>$3",[order.id,"Order "+order.order_number+" received",shop.owner_subject]);
      await db.query("COMMIT");return {order,replayed:false};
    }catch(e){await db.query("ROLLBACK");throw e}});
    return json(result,result.replayed?200:201);
    } catch(error){if(error?.message==="REQUEST_REUSED")return json({error:"Request ID already used for another checkout"},409);if(error?.message==="SHOP")return json({error:"Shop is not approved or available"},409);if(error?.message==="ITEMS")return json({error:"Menu items are unavailable or invalid"},400);throw error}
  }
  const statusRoute=/^\/api\/owner\/orders\/([0-9a-f-]{36})\/status$/.exec(path);
  if(method==="PATCH"&&statusRoute&&uuid.test(statusRoute[1])){
    const body=await readBody(request);if(!body||!statuses.includes(body.status)||typeof(body.note||"")!=="string"||String(body.note||"").length>500)return json({error:"Invalid status"},400);
    const result=await withDb(env,async db=>{await db.query("BEGIN");try{const row=(await db.query("SELECT o.id,o.status,o.fulfillment_type,o.customer_subject FROM kc_orders o JOIN kc_shops s ON s.id=o.shop_id WHERE o.id=$1 AND s.owner_subject=$2 FOR UPDATE OF o",[statusRoute[1],subject])).rows[0];if(!row){await db.query("ROLLBACK");return null}if(!(next[row.status]||[]).includes(body.status)||body.status==="ready_for_collection"&&row.fulfillment_type!=="pickup"||body.status==="out_for_delivery"&&row.fulfillment_type!=="delivery"){await db.query("ROLLBACK");return false}await db.query("UPDATE kc_orders SET status=$1,owner_note=$2,updated_at=now() WHERE id=$3",[body.status,body.note||"",row.id]);await db.query("INSERT INTO kc_order_status_events(order_id,previous_status,new_status,actor_subject,actor_role,note) VALUES($1,$2,$3,$4,'owner',$5)",[row.id,row.status,body.status,subject,body.note||""]);await db.query("INSERT INTO kc_notifications(recipient_subject,order_id,kind,title,body) VALUES($1,$2,'order_status','Order status updated',$3)",[row.customer_subject,row.id,body.status]);
      await db.query("INSERT INTO kc_notifications(recipient_subject,order_id,kind,title,body) SELECT subject,$1,'order_status','Order status updated',$2 FROM kc_admins",[row.id,body.status]);await db.query("COMMIT");return true}catch(e){await db.query("ROLLBACK");throw e}});
    return result===null?json({error:"Order not found"},404):result===false?json({error:"Invalid status transition"},409):json({ok:true});
  }
  return json({error:"Not found"},404);
}
