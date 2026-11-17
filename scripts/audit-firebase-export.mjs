#!/usr/bin/env node
// Read-only Firebase export inventory. No database connection, no secrets, no mutation.
// Usage: node scripts/audit-firebase-export.mjs path/to/export.json
import { readFileSync } from "node:fs";
const file=process.argv[2];
if(!file){console.error("Usage: node scripts/audit-firebase-export.mjs <firebase-export.json>");process.exit(2)}
let data;try{data=JSON.parse(readFileSync(file,"utf8"))}catch(e){console.error("Cannot read JSON export:",e.message);process.exit(2)}
const names=["shops","shopApplications","orders"];
const collections=Object.fromEntries(names.map(name=>[name,Array.isArray(data[name])?data[name]:[]]));
let failed=false;
for(const name of names){if(!Array.isArray(data[name])){console.error("Missing collection array:",name);failed=true}}
const ids=new Set(),duplicateIds=[];
for(const [name,rows] of Object.entries(collections))for(const row of rows){const id=row.id||row.documentId;if(!id){failed=true;continue}const key=name+":"+id;if(ids.has(key)){duplicateIds.push(key);failed=true}ids.add(key)}
const shops=collections.shops;
const orders=collections.orders;
const applications=collections.shopApplications;
const unmappedOwners=shops.filter(s=>!s.ownerUid&&!s.ownerSubject);
const missingShopOrders=orders.filter(o=>!o.shopId);
const shopIds=new Set(shops.map(s=>s.id||s.documentId).filter(Boolean).map(String));
const orphanShopOrders=orders.filter(o=>o.shopId&&!shopIds.has(String(o.shopId)));
const orderIds=new Set(orders.map(o=>o.id||o.documentId));
const duplicateOrderNumbers=orders.map(o=>o.orderNumber).filter((n,i,a)=>n&&a.indexOf(n)!==i);
if(unmappedOwners.length||missingShopOrders.length||orphanShopOrders.length||duplicateOrderNumbers.length)failed=true;
const summary={
  shops:shops.length,applications:applications.length,orders:orders.length,
  approvedShops:shops.filter(s=>s.approved===true||s.status==="approved").length,
  missingOwnerIdentity:unmappedOwners.length,
  missingOrderShopReference:missingShopOrders.length,
  orphanOrderShopReference:orphanShopOrders.length,
  duplicateDocumentIds:duplicateIds.length,
  duplicateOrderNumbers:duplicateOrderNumbers.length,
  orderRecordsWithItems:orders.filter(o=>Array.isArray(o.items)&&o.items.length>0).length,
  orderRecordsWithStatus:orders.filter(o=>o.orderStatus||o.status).length,
  ownerFirebaseUids:[...new Set(shops.map(s=>s.ownerUid).filter(Boolean))].length,
  customerFirebaseUids:[...new Set(orders.map(o=>o.customerUid).filter(Boolean))].length,
  requiresNeonIdentityMapping:true,
  readOnly:true
};
console.log(JSON.stringify(summary,null,2));
if(failed){console.error("Export is incomplete or inconsistent. No migration should run.");process.exitCode=1}
