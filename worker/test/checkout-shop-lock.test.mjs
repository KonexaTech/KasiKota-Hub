import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source=readFileSync(new URL("../src/neon-api.js",import.meta.url),"utf8");
test("checkout locks the approved shop row inside its transaction",()=>{
 const checkout=source.slice(source.indexOf('if(method==="POST"&&path==="/api/orders")'));
 assert.match(checkout,/await db\.query\("BEGIN"\)/);
 assert.match(checkout,/SELECT id,owner_subject FROM kc_shops WHERE id=\$1 AND approved=true FOR SHARE/);
 assert.ok(checkout.indexOf('await db.query("BEGIN")')<checkout.indexOf("FOR SHARE"));
 assert.ok(checkout.indexOf("FOR SHARE")<checkout.indexOf("INSERT INTO kc_orders"));
});
test("shop lock does not change order price, commission or idempotency rules",()=>{
 assert.match(source,/data\.fulfillmentType==="delivery"\?500:0/);
 assert.match(source,/REQUEST_REUSED/);
 assert.match(source,/testOrder/);
});
