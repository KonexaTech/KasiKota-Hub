import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,statSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {configureSigning,verifySigningReport} from '../scripts/android-staging-signing.mjs';
test('owner-pinned signing is repeatable, private, idempotent and fail-closed without generating replacement identity',()=>{
 const root=mkdtempSync(join(tmpdir(),'konexa-signing-fixture-'));
 try{
  const gradleFile=join(root,'build.gradle');writeFileSync(gradleFile,'android {}\n');
  const run=env=>configureSigning({gradleFile,tempRoot:root,env});
  assert.deepEqual(run({}),{mode:'debug-ephemeral',certificateSha256:null});
  assert.throws(()=>run({ANDROID_STAGING_STORE_PASSWORD:'fixture'}),/incomplete/);
  assert.equal(readFileSync(gradleFile,'utf8'),'android {}\n');
  const key=join(root,'fixture.keystore'),env={ANDROID_STAGING_STORE_PASSWORD:'fixture-store-only',ANDROID_STAGING_KEY_PASSWORD:'fixture-store-only',ANDROID_STAGING_KEY_ALIAS:'fixture'};
  execFileSync('keytool',['-genkeypair','-keystore',key,'-storepass:env','ANDROID_STAGING_STORE_PASSWORD','-keypass:env','ANDROID_STAGING_KEY_PASSWORD','-alias','fixture','-keyalg','RSA','-keysize','2048','-validity','30','-dname','CN=Disposable Local Test','-noprompt'],{env:{...process.env,...env},stdio:'ignore'});
  const cert=execFileSync('keytool',['-exportcert','-keystore',key,'-storepass:env','ANDROID_STAGING_STORE_PASSWORD','-alias','fixture'],{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
  Object.assign(env,{ANDROID_STAGING_KEYSTORE_BASE64:readFileSync(key).toString('base64'),ANDROID_STAGING_CERT_SHA256:createHash('sha256').update(cert).digest('hex')});
  const first=run(env),second=run(env);
  assert.equal(first.mode,'stable-owner-key');assert.equal(first.certificateSha256,second.certificateSha256);assert.equal(statSync(first.keystore).mode&0o777,0o600);
  const gradle=readFileSync(gradleFile,'utf8');
  assert.equal(gradle.split('// BEGIN KONEXATECH PRIVATE STAGING SIGNING').length,2);
  assert(gradle.includes('\nandroid {\n'));assert(!gradle.includes(env.ANDROID_STAGING_STORE_PASSWORD));assert(!gradle.includes(env.ANDROID_STAGING_KEYSTORE_BASE64));
  const count=readdirSync(root).length;
  for(const patch of [{ANDROID_STAGING_CERT_SHA256:'0'.repeat(64)},{ANDROID_STAGING_STORE_PASSWORD:'incorrect'},{ANDROID_STAGING_KEYSTORE_BASE64:'bad'}]){
   assert.throws(()=>run({...env,...patch}));assert.equal(readdirSync(root).length,count);assert.equal(readFileSync(gradleFile,'utf8'),gradle);
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('built APK must retain the pinned signer; debug artifacts never claim upgrade acceptance',()=>{
 const cert='a'.repeat(64),text='Verified using v2 scheme (APK Signature Scheme v2): true\\nV2 Signer: certificate SHA-256 digest: '+cert;
 assert.equal(verifySigningReport(text,{}).mode,'debug-ephemeral');
 const env={KONEXA_STAGING_SIGNING_MODE:'stable-owner-key',KONEXA_STAGING_SIGNER_SHA256:cert};
 assert.equal(verifySigningReport(text,env).physicalUpgrade,'NOT TESTED');
 assert.throws(()=>verifySigningReport(text,{...env,KONEXA_STAGING_SIGNER_SHA256:'b'.repeat(64)}));
 assert.throws(()=>verifySigningReport('unsigned',env));
});

test('CLI writes parseable signing metadata without a false stable or physical claim',()=>{
 const root=mkdtempSync(join(tmpdir(),'konexa-signature-report-'));
 try{
  const signature=join(root,'signature.txt'),metadata=join(root,'signing-mode.json');
  writeFileSync(signature,'Verified using v2 scheme (APK Signature Scheme v2): true\\nV2 Signer: certificate SHA-256 digest: '+'a'.repeat(64));
  execFileSync(process.execPath,['scripts/android-staging-signing.mjs','verify',signature,metadata],{stdio:'pipe'});
  assert.equal(JSON.parse(readFileSync(metadata,'utf8')).mode,'debug-ephemeral');
 }finally{rmSync(root,{recursive:true,force:true});}
});
