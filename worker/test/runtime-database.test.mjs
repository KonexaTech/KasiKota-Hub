import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectConnectionOverrides,verifyRuntimeIdentity} from '../src/runtime-database.mjs';
import {deliveryDatabaseConnectionString} from '../src/deliveryDb.mjs';
test('ordering and bridge reject pg connection query overrides before database use',()=>{
 for(const field of ['host=other.example','user=postgres','dbname=production','options=-csearch_path=other']){
  assert.throws(()=>rejectConnectionOverrides(new URL('postgresql://kc_staging_worker:fixture@ep-test.neon.tech/neondb?'+field)),/overrides/);
  assert.throws(()=>deliveryDatabaseConnectionString({EXPECTED_NEON_HOST:'ep-test.neon.tech',KOTA_DELIVERY_DATABASE_URL:'postgresql://kc_delivery_bridge:fixture@ep-test.neon.tech/neondb?'+field}),/overrides/);
 }
 assert.doesNotThrow(()=>rejectConnectionOverrides(new URL('postgresql://kc_staging_worker:fixture@ep-test.neon.tech/neondb?sslmode=require&channel_binding=require')));
});
test('both runtime connections require the actual isolated database and unprivileged expected role',async()=>{
 for(const role of ['kc_staging_worker','kc_delivery_bridge']){
  const expected={database_name:'neondb',runtime_role:role,rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,privileged_membership:false};
  const client=row=>({query:async sql=>{assert.match(sql,/pg_has_role/);return {rows:row?[row]:[]};}});
  await verifyRuntimeIdentity(client(expected),role);
  for(const patch of [{database_name:'other'},{runtime_role:'neondb_owner'},...['rolsuper','rolbypassrls','rolcreaterole','rolcreatedb','rolreplication','privileged_membership'].map(key=>({[key]:true})),{rolsuper:undefined}])await assert.rejects(verifyRuntimeIdentity(client({...expected,...patch}),role),/identity check failed/);
  await assert.rejects(verifyRuntimeIdentity(client(null),role),/identity check failed/);
 }
});
