// Foreground web geolocation requires Android manifest declarations too.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const path=process.argv[2]||resolve(import.meta.dirname,'../android/app/src/main/AndroidManifest.xml');
let xml=await readFile(path,'utf8');
if(!xml.includes('</manifest>'))throw Error('Android manifest is missing its closing element');
for(const permission of ['ACCESS_COARSE_LOCATION','ACCESS_FINE_LOCATION']){
 if(!xml.includes('android:name="android.permission.'+permission+'"'))
  xml=xml.replace('</manifest>','    <uses-permission android:name="android.permission.'+permission+'" />\n</manifest>');
}
await writeFile(path,xml);
console.log('Foreground location permissions declared; runtime user consent remains required.');
