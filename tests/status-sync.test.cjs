const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const read=p=>fs.readFileSync(p,"utf8");
const app=read("staging-preview/neon-app.js");
const customer=read("staging-preview/kota-customer.mjs");
const worker=read("worker/src/neon-api.js");
test("owner must select an incoming order and verify the saved status",()=>{
 const html=read("staging-preview/neon-owner.html");
 assert.ok(html.includes('id="ownerOrderSelect"'));
 assert.ok(html.includes('id="currentOrderStatus"'));
 assert.ok(app.includes("new Option(order.order_number"));
 assert.ok(app.includes('if(!selected)throw Error("Click Refresh orders'));
 assert.ok(app.includes('await api("/api/owner/orders/"'));
 assert.ok(app.includes('const verified=await api("/api/orders/"'));
 assert.ok(app.includes("verified.order?.status!==status"));
});
test("customer tracking uses the saved guest order and refreshes from Neon",()=>{
 const html=read("staging-preview/neon-customer.html");
 assert.ok(html.includes('id="trackingStatus"'));
 assert.ok(html.includes('id="trackingChecked"'));
 assert.ok(customer.includes("async function trackOrder(announce=true)"));
 assert.ok(customer.includes('const response=await api("/orders/"+encodeURIComponent(id))'));
 assert.ok(customer.includes('$("trackingStatus").textContent="Order "'));
 assert.ok(customer.includes("localStorage.setItem(ORDER_KEY,id)"));
 assert.ok(customer.includes("localStorage.getItem(ORDER_KEY)"));
 assert.ok(customer.includes('setInterval(()=>{if(document.visibilityState==="visible")trackOrder(false).catch(()=>{})},10000);'));
});
test("owner transitions match the backend and prevent unsupported delivery states",()=>{
 const start=app.indexOf("const allowedOwnerTransitions=");
 const end=app.indexOf("function updateOwnerOrderSelection()",start);
 assert.ok(start>=0&&end>start,"Owner transition policy missing");
 const context={};
 vm.runInNewContext(app.slice(start,end)+"\nglobalThis.check=nextOwnerStatuses;",context);
 const check=(status,fulfillment_type)=>Array.from(context.check({status,fulfillment_type}));
 assert.deepEqual(check("pending","pickup"),["accepted","rejected","delayed"]);
 assert.deepEqual(check("accepted","pickup"),["preparing","delayed","rejected"]);
 assert.deepEqual(check("preparing","pickup"),["ready_for_collection","delayed"]);
 assert.deepEqual(check("preparing","delivery"),["out_for_delivery","delayed"]);
 assert.deepEqual(check("ready_for_collection","pickup"),["completed"]);
 assert.deepEqual(check("completed","pickup"),[]);
 assert.deepEqual(check("delayed","delivery"),["accepted","rejected"]);
 const backend={};const declaration=/const next=([^;]+);/.exec(worker);assert.ok(declaration);
 vm.runInNewContext("globalThis.policy="+declaration[1],backend);
 const sql=read("neon/migrations/005_order_status_transitions.sql");
 const persisted={};
 for(const match of sql.matchAll(/OLD.status = '([^']+)' AND NEW.status IN \(([^)]+)\)/g))persisted[match[1]]=[...match[2].matchAll(/'([^']+)'/g)].map(value=>value[1]);
 for(const match of sql.matchAll(/OLD.status = '([^']+)' AND NEW.status = '([^']+)'/g))persisted[match[1]]=[match[2]];
 for(const status of ["pending","accepted","preparing","delayed","ready_for_collection","out_for_delivery","completed","rejected"]){
   assert.deepEqual(Array.from(backend.policy[status]||[]).sort(),(persisted[status]||[]).sort(),"API must match persisted transition guard: "+status);
   for(const fulfillment of ["pickup","delivery"]){
    const expected=(persisted[status]||[]).filter(value=>(value!=="ready_for_collection"||fulfillment==="pickup")&&(value!=="out_for_delivery"||fulfillment==="delivery")).sort();
    assert.deepEqual(check(status,fulfillment).sort(),expected,"Owner UI must match database for "+status+"/"+fulfillment);
   }
 }
});
