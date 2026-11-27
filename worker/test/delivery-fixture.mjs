import { readFile } from 'node:fs/promises';
import { postgresFixture } from './postgres-fixture.mjs';
export const orderId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',jobId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export async function deliveryFixture(){
 const fixture=await postgresFixture(),db=fixture.db;
 await db.exec(await readFile(new URL('../../docs/release/delivery-source-quote-schema.PROPOSED.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../docs/release/delivery-callback-schema.PROPOSED.sql',import.meta.url),'utf8'));
 await db.query("INSERT INTO kc_shops(id,owner_subject,name,area,approved) VALUES($1,'owner','TEST delivery','TEST',true)",['cccccccc-cccc-4ccc-8ccc-cccccccccccc']);
 await db.query("INSERT INTO kc_orders(id,order_number,shop_id,customer_subject,customer_name,customer_phone,area,fulfillment_type,subtotal_cents,delivery_cents,total_cents,test_order) VALUES($1,'TEST-DELIVERY',$2,'guest:opaque-customer','TEST customer','000','TEST','delivery',100,0,100,true)",[orderId,'cccccccc-cccc-4ccc-8ccc-cccccccccccc']);
 for(const status of ['accepted','preparing','out_for_delivery'])await db.query('UPDATE kc_orders SET status=$1 WHERE id=$2',[status,orderId]);
 await db.query("INSERT INTO kc_delivery_quotes(order_id,pickup_lat,pickup_lon,dropoff_lat,dropoff_lon,route_distance_m,weight_grams,currency,fee_cents,payout_cents,payment_verified,cash_on_delivery_approved,dispatch_ready,approved_at,approved_by) VALUES($1,-27,30,-27.01,30.01,1000,1000,'ZAR',0,0,false,true,true,now()-interval '1 minute','TEST operator')",[orderId]);
 return {...fixture,withDb:async(_,fn)=>fn(db)};
}
