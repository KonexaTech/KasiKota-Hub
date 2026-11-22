import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { neonApi } from '../src/neon-api.js';

const source=await readFile(new URL('../src/neon-api.js',import.meta.url),'utf8');

test('bulk notification read refuses unsigned callers without touching the database',async()=>{
  let databaseCalls=0;
  const request=new Request('https://kota-connect-api-dev.siboniisozulu.workers.dev/api/notifications/read-all',{method:'PATCH'});
  const response=await neonApi(request,{},async()=>{databaseCalls++;throw Error('Unauthorized request reached database')});
  assert.equal(response.status,401);
  assert.equal(databaseCalls,0);
});

test('bulk read is one recipient-scoped and unread-only atomic update',()=>{
  const start=source.indexOf('if(method==="PATCH"&&path==="/api/notifications/read-all")');
  const end=source.indexOf('const readNotification=',start);
  assert.ok(start>0&&end>start,'Expected dedicated bulk handler before single-notification route');
  const handler=source.slice(start,end);
  assert.match(handler,/subject\.startsWith\("guest:"\)/,'Guest callers must not bulk-update');
  assert.match(handler,/WHERE recipient_subject=\$1 AND read_at IS NULL/,'Only current user and unread rows');
  assert.match(handler,/\[subject\]/,'Authenticated server identity must be the sole update parameter');
  assert.match(handler,/UPDATE kc_notifications SET read_at=now\(\)/,'Must persist read state');
  assert.doesNotMatch(handler,/await readBody\(/,'No client-provided recipient or query body');
});
