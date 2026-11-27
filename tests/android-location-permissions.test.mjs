import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
test('generated Android manifest retains branding and existing permissions while adding only foreground location, idempotently',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'kota-location-'));
 try{
  const path=join(dir,'AndroidManifest.xml');
  await writeFile(path,'<manifest xmlns:android="http://schemas.android.com/apk/res/android"><uses-permission android:name="android.permission.INTERNET"/><application android:label="Kota Connect" /></manifest>');
  const run=()=>execFileSync(process.execPath,['android-staging/scripts/apply-location-permissions.mjs',path],{stdio:'pipe'});
  run();const first=await readFile(path,'utf8');run();assert.equal(await readFile(path,'utf8'),first);
  for(const permission of ['INTERNET','ACCESS_COARSE_LOCATION','ACCESS_FINE_LOCATION'])assert.equal(first.split('android.permission.'+permission+'"').length-1,1);
  assert.match(first,/android:label="Kota Connect"/);assert.doesNotMatch(first,/BACKGROUND_LOCATION/);
  await writeFile(path,'invalid fixture');assert.throws(run);assert.equal(await readFile(path,'utf8'),'invalid fixture');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('the APK workflow applies and verifies actual packaged foreground permissions',async()=>{
 const workflow=await readFile('.github/workflows/build-neon-staging-apk.yml','utf8');
 const legacy=await readFile('.github/workflows/build-android-staging.yml','utf8');
 assert.match(legacy,/apply-location-permissions.mjs android\/app\/src\/main\/AndroidManifest.xml/);
 assert.match(workflow,/node android-staging\/scripts\/apply-location-permissions.mjs/);
 assert.match(workflow,/grep -q.*uses-permission: name='android.permission.ACCESS_COARSE_LOCATION'.*device-artifact\/package.txt/);
 assert.match(workflow,/grep -q.*uses-permission: name='android.permission.ACCESS_FINE_LOCATION'.*device-artifact\/package.txt/);
});
