import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {deliveryFixture,orderId} from './delivery-fixture.mjs';
test('GPS weight snapshots reproduce restricted-role failure and need only one extra INSERT-column grant',async()=>{
 const f=await deliveryFixture(),role=f.schema+'_runtime';try{
  await f.db.exec('ALTER TABLE kc_order_items ADD COLUMN unit_weight_grams integer');
  const menu=randomUUID();await f.db.query("INSERT INTO kc_menu_items(id,shop_id,name,price_cents) SELECT $1,shop_id,'TEST weight',100 FROM kc_orders WHERE id=$2",[menu,orderId]);
  await f.db.exec(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS;
   GRANT USAGE ON SCHEMA ${f.schema} TO ${role};
   GRANT INSERT(order_id,menu_item_id,item_name,unit_price_cents,quantity) ON kc_order_items TO ${role};
   SET ROLE ${role}`);
  const insert=()=>f.db.query('INSERT INTO kc_order_items(order_id,menu_item_id,item_name,unit_price_cents,quantity,unit_weight_grams) VALUES($1,$2,$3,$4,$5,$6)',[orderId,menu,'TEST weight',100,1,500]);
  await assert.rejects(insert(),e=>e.code==='42501');await f.db.exec('RESET ROLE');
  const sql=await readFile(new URL('../../docs/release/gps-runtime-grants.sql',import.meta.url),'utf8');
  await f.db.exec(sql.replaceAll('public.',f.schema+'.').replaceAll('kc_staging_worker',role));
  await f.db.exec('SET ROLE '+role);await insert();
  await assert.rejects(f.db.query('UPDATE kc_order_items SET unit_weight_grams=1 WHERE order_id=$1',[orderId]),e=>e.code==='42501');
  await assert.rejects(f.db.query('DELETE FROM kc_order_items WHERE order_id=$1',[orderId]),e=>e.code==='42501');
  await f.db.exec('RESET ROLE');
  const row=(await f.db.query('SELECT quantity,unit_price_cents,unit_weight_grams FROM kc_order_items WHERE order_id=$1',[orderId])).rows[0];
  assert.deepEqual(row,{quantity:1,unit_price_cents:100,unit_weight_grams:500});
 }finally{await f.db.exec('RESET ROLE');await f.close();}
});
