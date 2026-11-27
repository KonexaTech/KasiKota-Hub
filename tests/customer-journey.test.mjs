import test from "node:test";
import assert from "node:assert/strict";
import { findShops, quoteCents, inArea } from "../staging-preview/shop-discovery.mjs";
const shops=[
 {name:"Prince Kota Shop",area:"section 1 ,",address:"Madadeni"},
 {name:"CBD Kota Place",area:"Newcastle CBD",address:"Newcastle"},
 {name:"Kota Palace",area:"Osizweni",address:"Osizweni"},
 {name:"Other Shop",area:"Other Newcastle area",address:"Farm"}
];
test("area dropdown finds sections despite informal addresses",()=>{
 assert.deepEqual(findShops(shops,"madadeni-section-1","").map(x=>x.name),["Prince Kota Shop"]);
 assert.deepEqual(findShops(shops,"osizweni","").map(x=>x.name),["Kota Palace"]);
 assert.ok(inArea(shops[1],"newcastle-cbd"));
});
test("shop name search works independently and together with dropdown",()=>{
 assert.equal(findShops(shops,"all","prince").length,1);
 assert.equal(findShops(shops,"madadeni-section-1","prince kota").length,1);
 assert.equal(findShops(shops,"osizweni","prince").length,0);
});
test("confirmation quote shows item price and delivery fee, but backend controls final payment",()=>{
 assert.equal(quoteCents(2500,1,"pickup"),2500);
 assert.equal(quoteCents(2500,2,"delivery"),6500);
 assert.throws(()=>quoteCents(2000,0,"pickup"));
 assert.throws(()=>quoteCents(2000,51,"delivery"));
});
