// Owner-held staging material only. Never generate or export a private signing key here.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,chmodSync,rmSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const signingNames=['ANDROID_STAGING_KEYSTORE_BASE64','ANDROID_STAGING_STORE_PASSWORD','ANDROID_STAGING_KEY_ALIAS','ANDROID_STAGING_KEY_PASSWORD','ANDROID_STAGING_CERT_SHA256'];
const start='// BEGIN KONEXATECH PRIVATE STAGING SIGNING',end='// END KONEXATECH PRIVATE STAGING SIGNING';
export function configureSigning({gradleFile,tempRoot,env}){
 const present=signingNames.filter(name=>typeof env[name]==='string'&&env[name].length>0);
 if(!present.length)return {mode:'debug-ephemeral',certificateSha256:null};
 if(present.length!==signingNames.length)throw Error('Stable signing configuration is incomplete; no debug fallback permitted.');
 if(!/^[a-f0-9]{64}$/i.test(env.ANDROID_STAGING_CERT_SHA256))throw Error('Expected certificate SHA256 must be exactly64 hexadecimal characters.');
 if(typeof tempRoot!=='string'||!tempRoot||/[\r\n]/.test(tempRoot))throw Error('A private temporary directory is required.');
 const encoded=env.ANDROID_STAGING_KEYSTORE_BASE64.replace(/\s/g,''),bytes=Buffer.from(encoded,'base64');
 if(!bytes.length||bytes.length>131072||bytes.toString('base64')!==encoded)throw Error('Invalid staging keystore encoding.');
 const original=readFileSync(gradleFile,'utf8');
 const dir=mkdtempSync(join(tempRoot,'konexatech-staging-signing-'));chmodSync(dir,0o700);
 const keystore=join(dir,'staging.keystore');writeFileSync(keystore,bytes,{mode:0o600});
 try{
  let cert;try{cert=execFileSync('keytool',['-exportcert','-keystore',keystore,'-storepass:env','ANDROID_STAGING_STORE_PASSWORD','-alias',env.ANDROID_STAGING_KEY_ALIAS],{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});}
  catch{throw Error('Cannot open the authorized staging certificate; check private signing settings.');}
  const certificateSha256=createHash('sha256').update(cert).digest('hex');
  if(certificateSha256!==env.ANDROID_STAGING_CERT_SHA256.toLowerCase())throw Error('Signing certificate differs from the owner-approved fingerprint.');
  const clean=original.replace(/\/\/ BEGIN KONEXATECH PRIVATE STAGING SIGNING[\s\S]*?\/\/ END KONEXATECH PRIVATE STAGING SIGNING\n?/g,'');
  const block=[
   start,'android {','  signingConfigs {','    konexaPrivateStaging {',
   "      storeFile file(System.getenv('KONEXA_STAGING_KEYSTORE_PATH'))",
   "      storePassword System.getenv('ANDROID_STAGING_STORE_PASSWORD')",
   "      keyAlias System.getenv('ANDROID_STAGING_KEY_ALIAS')",
   "      keyPassword System.getenv('ANDROID_STAGING_KEY_PASSWORD')",
   '    }','  }','  buildTypes {','    debug { signingConfig signingConfigs.konexaPrivateStaging }','  }','}',end,''
  ].join('\n');
  writeFileSync(gradleFile,clean.trimEnd()+'\n'+block);
  return {mode:'stable-owner-key',keystore,certificateSha256};
 }catch(error){rmSync(dir,{recursive:true,force:true});throw error;}
}
export function verifySigningReport(text,env){
 const cert=/certificate SHA-256 digest: ([a-f0-9]{64})/i.exec(text)?.[1]?.toLowerCase();
 if(!cert||!text.includes('Verified using v2 scheme (APK Signature Scheme v2): true'))throw Error('APK signature report is invalid.');
 const mode=env.KONEXA_STAGING_SIGNING_MODE||'debug-ephemeral';
 if(mode==='stable-owner-key'&&cert!==env.KONEXA_STAGING_SIGNER_SHA256)throw Error('Built APK does not match the pinned staging signer.');
 if(!['stable-owner-key','debug-ephemeral'].includes(mode))throw Error('Unknown signing mode.');
 return {mode,certificateSha256:cert,physicalUpgrade:'NOT TESTED',historicalDebugCompatibility:'NOT VERIFIED'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv[2]==='verify'){
   const result=verifySigningReport(readFileSync(process.argv[3],'utf8'),process.env);
   writeFileSync(process.argv[4],JSON.stringify(result,null,2)+'\n');
   process.exit(0);
  }
  const result=configureSigning({gradleFile:process.argv[2],tempRoot:process.env.RUNNER_TEMP,env:process.env});
  if(result.keystore)appendFileSync(process.env.GITHUB_ENV,'KONEXA_STAGING_KEYSTORE_PATH='+result.keystore+'\n');
  appendFileSync(process.env.GITHUB_ENV,'KONEXA_STAGING_SIGNING_MODE='+result.mode+'\n');
  if(result.certificateSha256)appendFileSync(process.env.GITHUB_ENV,'KONEXA_STAGING_SIGNER_SHA256='+result.certificateSha256+'\n');
  console.log(result.mode==='stable-owner-key'?'Owner-pinned stable staging certificate verified.':'Inspection debug build only: upgrade signing is NOT verified.');
 }catch{console.error('Staging signing blocked. Check the required private settings and approved fingerprint.');process.exitCode=1;}
}
