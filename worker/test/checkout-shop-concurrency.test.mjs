import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const connectionString=process.env.KOTA_LOCK_TEST_DATABASE_URL;
test('approved checkout shop lock blocks a concurrent suspension until checkout releases it',
  {skip:!connectionString?'BLOCKED: isolated local PostgreSQL concurrency fixture not configured':false,timeout:15000},async()=>{
    const target=new URL(connectionString);
    assert.ok(['127.0.0.1','localhost','[::1]'].includes(target.hostname),'Refuse non-local database');
    assert.equal(target.pathname,'/kota_lock_test','Refuse any database except the disposable concurrency fixture');
    const source=readFileSync(new URL('../src/neon-api.js',import.meta.url),'utf8');
    const checkout=source.slice(source.indexOf('if(method==="POST"&&path==="/api/orders")'));
    const sql=/db.query\("(SELECT id,owner_subject FROM kc_shops[^"\n]+)"/.exec(checkout)?.[1];
    assert.ok(sql,'actual checkout shop SQL must be available');
    const schema='kota_lock_'+randomUUID().replaceAll('-','');
    const shop=randomUUID();
    const reader=new Client({connectionString,connectionTimeoutMillis:5000});
    const writer=new Client({connectionString,connectionTimeoutMillis:5000});
    let created=false;
    try {
      await reader.connect();await writer.connect();
      await reader.query(`CREATE SCHEMA ${schema}`);created=true;
      await reader.query(`CREATE TABLE ${schema}.kc_shops(id uuid PRIMARY KEY,owner_subject text NOT NULL,approved boolean NOT NULL)`);
      await reader.query(`INSERT INTO ${schema}.kc_shops VALUES($1,'fixture-owner',true)`,[shop]);
      await reader.query(`SET search_path TO ${schema}`);await writer.query(`SET search_path TO ${schema}`);
      await reader.query('BEGIN');
      assert.equal((await reader.query(sql,[shop])).rowCount,1);
      await writer.query('BEGIN');
      await writer.query("SET LOCAL lock_timeout='150ms'");
      // PostgreSQL itself must reject the conflicting writer while checkout holds its row lock.
      await assert.rejects(writer.query('UPDATE kc_shops SET approved=false WHERE id=$1',[shop]),{code:'55P03'});
      await writer.query('ROLLBACK');
      await reader.query('COMMIT');
      assert.equal((await writer.query('UPDATE kc_shops SET approved=false WHERE id=$1',[shop])).rowCount,1);
      assert.equal((await reader.query(sql,[shop])).rowCount,0,'a later checkout must reject the now-unapproved shop');
    } finally {
      await reader.query('ROLLBACK').catch(()=>{});await writer.query('ROLLBACK').catch(()=>{});
      if(created)await reader.query(`DROP SCHEMA ${schema} CASCADE`);
      await Promise.all([reader.end(),writer.end()]);
    }
  });
