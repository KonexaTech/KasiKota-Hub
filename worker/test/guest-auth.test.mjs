import test from "node:test";
import assert from "node:assert/strict";
import {guestRouteAllowed,verifiedGuestSubject} from "../src/guest-auth.js";

const token="ab".repeat(32);
const request=value=>new Request("https://staging.example/api/orders",{headers:{authorization:value}});
test("guest secret yields a stable opaque subject, never the raw token",async()=>{
 const a=await verifiedGuestSubject(request("Guest "+token));
 const b=await verifiedGuestSubject(request("Guest "+token));
 assert.equal(a,b);
 assert.match(a,/^guest:[a-f0-9]{64}$/);
 assert.ok(!a.includes(token));
 assert.notEqual(a,await verifiedGuestSubject(request("Guest "+"ab".repeat(31)+"ac")));
});
test("reject missing, malformed or short guest credentials",async()=>{
 for(const h of ["","Bearer "+token,"Guest abc","Guest "+"z".repeat(64),"Guest "+"ab".repeat(31)]){
  assert.equal(await verifiedGuestSubject(request(h)),null);
 }
});
test("guest can only order, view their own order and track status",()=>{
 const id="123e4567-e89b-12d3-a456-426614174000";
 for(const [method,path] of [["POST","/api/orders"],["POST","/api/orders/"+id+"/delivery-verification"],["GET","/api/orders/mine"],["GET","/api/notifications"],["PATCH","/api/notifications/"+id+"/read"],["GET","/api/orders/"+id],["GET","/api/orders/"+id+"/items"],["GET","/api/orders/"+id+"/history"],["GET","/api/orders/"+id+"/delivery"]]){
   assert.equal(guestRouteAllowed(method,path),true,method+" "+path);
 }
 for(const [method,path] of [["GET","/api/me"],["POST","/api/owner/orders/"+id+"/delivery-verification"],["GET","/api/owner/orders"],["GET","/api/owner/shops"],["POST","/api/shop-applications"],["GET","/api/admin/orders"],["PATCH","/api/admin/shop-applications/"+id+"/review"],["PATCH","/api/owner/orders/"+id+"/status"],["POST","/api/orders/mine"],["GET","/api/orders/not-an-id"]]){
   assert.equal(guestRouteAllowed(method,path),false,method+" "+path);
 }
});
