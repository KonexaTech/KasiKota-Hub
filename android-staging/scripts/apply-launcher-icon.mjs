// Use Kota Connect's existing brand artwork for every generated Android staging launcher icon.
// Keeps Android package ID unchanged and intentionally avoids the default Capacitor robot icon.
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
const root=resolve(import.meta.dirname,"../..");
const source=resolve(root,"icon-512.png");
const res=resolve(root,"android-staging/android/app/src/main/res");
const icon=await readFile(source);
if(icon.length<10000 || icon.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")
  throw Error("Missing genuine Kota Connect PNG launcher artwork");
const width=icon.readUInt32BE(16),height=icon.readUInt32BE(20);
if(width!==512||height!==512)throw Error("Kota Connect launcher artwork must be 512 × 512 PNG");
// Legacy mipmap images intentionally override the generated default app icon on Android 8+.
// Removing template adaptive-icon XML prevents a blank default foreground from hiding the brand.
for(const xml of ["ic_launcher.xml","ic_launcher_round.xml"]){
  await rm(resolve(res,"mipmap-anydpi-v26",xml),{force:true});
}
for(const density of ["mdpi","hdpi","xhdpi","xxhdpi","xxxhdpi"]){
  const directory=resolve(res,"mipmap-"+density);
  await mkdir(directory,{recursive:true});
  for(const file of ["ic_launcher.png","ic_launcher_round.png"]){
    await writeFile(resolve(directory,file),icon);
  }
}
console.log("Kota Connect branded launcher icon applied for Android 8+");
