import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const dispatchSource = readFileSync(new URL("../src/delivery-dispatch.js", import.meta.url), "utf8");
const callbackSource = readFileSync(new URL("../src/delivery-events.js", import.meta.url), "utf8");
const bridgeGrants = readFileSync(new URL("../../docs/release/delivery-bridge-role-grants.PROPOSED.sql", import.meta.url), "utf8");
test("delivery bridge serializes source-order writes without UPDATE privilege on customer orders",()=>{
 assert.match(dispatchSource,/pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/);
 assert.match(callbackSource,/pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/);
 assert.doesNotMatch(dispatchSource,/kc_orders WHERE id=\$1 FOR UPDATE/);
 assert.doesNotMatch(callbackSource,/FOR UPDATE OF o/);
});
test("bridge grants are column-scoped and cannot read customer PII or unrelated business tables",()=>{
 assert.match(bridgeGrants,/REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public/);
 assert.match(bridgeGrants,/GRANT SELECT \(id, customer_subject, fulfillment_type, status, delivery_cents, shop_id\)/);
 assert.match(bridgeGrants,/GRANT SELECT \(id, owner_subject, approved\)/);
 assert.doesNotMatch(bridgeGrants,/GRANT SELECT ON public\.kc_orders/);
 assert.doesNotMatch(bridgeGrants,/GRANT SELECT ON public\.kc_shops/);
 assert.doesNotMatch(bridgeGrants,/GRANT SELECT ON public\.kc_admins/);
});
