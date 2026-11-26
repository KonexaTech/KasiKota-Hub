import test from "node:test";
import assert from "node:assert/strict";
import { deliveryDatabaseConnectionString } from "../src/deliveryDb.mjs";
const host="ep-lively-leaf-za5rtfhs.c-2.eu-west-2.aws.neon.tech";
const env={EXPECTED_NEON_HOST:host,KOTA_DELIVERY_DATABASE_URL:"postgresql://kc_delivery_bridge:fake-test-password@"+host+"/neondb?sslmode=require"};
test("delivery bridge accepts only its dedicated restricted role and exact staging Neon target",()=>{
 assert.equal(deliveryDatabaseConnectionString(env),env.KOTA_DELIVERY_DATABASE_URL);
 const pooled=host.replace(/^([^.]+)\./,"$1-pooler.");
 assert.equal(deliveryDatabaseConnectionString({...env,KOTA_DELIVERY_DATABASE_URL:"postgresql://kc_delivery_bridge:fake-test-password@"+pooled+"/neondb?sslmode=require"}).includes(pooled),true);
});
test("delivery bridge fails closed for missing, wrong-role, wrong-database and wrong-host connections",()=>{
 for(const patch of [
  {KOTA_DELIVERY_DATABASE_URL:""},
  {KOTA_DELIVERY_DATABASE_URL:"postgresql://neondb_owner:fake@"+host+"/neondb"},
  {KOTA_DELIVERY_DATABASE_URL:"postgresql://kc_delivery_bridge:fake@"+host+"/other"},
  {KOTA_DELIVERY_DATABASE_URL:"postgresql://kc_delivery_bridge:fake@other.neon.tech/neondb"},
  {KOTA_DELIVERY_DATABASE_URL:"http://kc_delivery_bridge:fake@"+host+"/neondb"},
  {EXPECTED_NEON_HOST:"",KOTA_DELIVERY_DATABASE_URL:env.KOTA_DELIVERY_DATABASE_URL}
 ])assert.throws(()=>deliveryDatabaseConnectionString({...env,...patch}));
});
