import test from "node:test";
import assert from "node:assert/strict";
import {cyclingRouteDistance} from "../src/cycling-route.js";
const args={pickup:{lat:-27.75,lon:29.93},dropoff:{lat:-27.76,lon:29.94},apiKey:"synthetic"};
test("uses cycling route and rounds actual distance",async()=>{
 const distance=await cyclingRouteDistance({...args,fetcher:async(url,options)=>{
 assert.equal(url,"https://api.heigit.org/openrouteservice/v2/directions/cycling-regular/json");
 assert.equal(options.redirect,"manual");assert.equal(options.headers.Authorization,args.apiKey);
 assert.deepEqual(Object.keys(JSON.parse(options.body)),["coordinates"]);
 assert.deepEqual(JSON.parse(options.body).coordinates,[[29.93,-27.75],[29.94,-27.76]]);
 return {ok:true,json:async()=>({routes:[{summary:{distance:1234.2}}]})};
 }});
 assert.equal(distance,1235);
});
test("missing key fails closed",async()=>assert.rejects(cyclingRouteDistance({...args,apiKey:""}),/ROUTING_UNAVAILABLE/));
test("provider errors fail closed",async()=>assert.rejects(cyclingRouteDistance({...args,fetcher:async()=>({ok:false})}),/ROUTING_UNAVAILABLE/));
test("missing distance fails closed",async()=>assert.rejects(cyclingRouteDistance({...args,fetcher:async()=>({ok:true,json:async()=>({routes:[]})})}),/ROUTING_UNAVAILABLE/));
test("invalid coordinates fail closed",async()=>assert.rejects(cyclingRouteDistance({...args,pickup:{lat:100,lon:0}}),/INVALID_LOCATION/));
