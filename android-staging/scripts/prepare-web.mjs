import {mkdir,copyFile,readFile,writeFile} from "node:fs/promises";import {resolve} from "node:path";
const root=resolve(import.meta.dirname,"../.."),www=resolve(import.meta.dirname,"../www");
await mkdir(www,{recursive:true});
await copyFile(resolve(root,"neon-customer.html"),resolve(www,"index.html"));
await copyFile(resolve(root,"neon-app.js"),resolve(www,"neon-app.js"));
await copyFile(resolve(root,"premium.css"),resolve(www,"premium.css"));
const html=await readFile(resolve(www,"index.html"),"utf8");
if(!html.includes("neon-app.js")||!html.includes('data-role="customer"'))throw Error("Neon staging entrypoint not found");
console.log("Prepared isolated Neon customer staging assets");
