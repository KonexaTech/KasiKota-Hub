const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const read=p=>fs.readFileSync(p,"utf8");
const stage=read("staging-preview/neon-app.js");
const root=read("neon-app.js");
const worker=read("worker/src/neon-api.js");
for(const [label,app,prefix] of [["staging",stage,"staging-preview/"],["root",root,""]]){
 test(label+" owner order must be selected and status read back from database",()=>{
   const html=read(prefix+"neon-owner.html");
   assert.match(html,/id="ownerOrderSelect"/);
   assert.match(html,/id="currentOrderStatus"/);
   assert.match(app,/new Option\(order\.order_number/);
   assert.match(app,/if\(!selected\)throw Error\("Click Refresh orders/);
   assert.match(app,/await api\("\/api\/owner\/orders\/"/);
   assert.match(app,/const verified=await api\("\/api\/orders\/"/);
   assert.match(app,/verified\.order\?\.status!==status/);
 });
 test(label+" customer tracking is polled and shown without overwriting checkout",()=>{
   const html=read(prefix+"neon-customer.html");
   assert.match(html,/id="trackingStatus"/);
   assert.match(html,/id="trackingChecked"/);
   assert.match(app,/refreshCustomerTracking=async function/);
   assert.match(app,/\$\("trackingStatus"\)\.textContent="Order "/);
   assert.match(app,/setInterval\(\(\)=>\{if\(document\.visibilityState==="visible"\)refreshCustomerTracking\(false\)/);
   assert.match(app,/\},10000\)/);
   assert.match(app,/rememberTrackedOrder\(data\.order\.id\)/);
   assert.match(app,/localStorage\.getItem\(lastTrackedOrderStorageKey\)/);
 });
 test(label+" only allows backend-supported status transitions",()=>{
   const start=app.indexOf("const allowedOwnerTransitions=");
   const end=app.indexOf("function updateOwnerOrderSelection()",start);
   assert.ok(start>=0&&end>start,"Owner transition policy missing");
   const context={};
   vm.runInNewContext(app.slice(start,end)+"\nglobalThis.check=nextOwnerStatuses;",context);
   const check=(status,fulfillment_type)=>Array.from(context.check({status,fulfillment_type}));
   assert.deepEqual(check("pending","pickup"),["accepted","rejected"]);
   assert.deepEqual(check("accepted","pickup"),["preparing","delayed","rejected"]);
   assert.deepEqual(check("preparing","pickup"),["ready_for_collection","delayed"]);
   assert.deepEqual(check("preparing","delivery"),["out_for_delivery","delayed"]);
   assert.deepEqual(check("ready_for_collection","pickup"),["completed"]);
   assert.deepEqual(check("completed","pickup"),[]);
   assert.match(worker,/const next=\{pending:\["accepted","rejected"\]/);
 });
}
