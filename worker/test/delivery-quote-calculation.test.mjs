import test from "node:test";
import assert from "node:assert/strict";
import {calculateDeliveryQuote} from "../src/delivery-quote-calculation.js";
const fixture=()=>({pickup:{lat:-27.75,lon:29.93},dropoff:{lat:-27.76,lon:29.94},routeDistanceM:2100,items:[{weightGrams:400,quantity:2},{weightGrams:200,quantity:1}]});
test("staging quote calculates server tariff and aggregate weight",()=>{
 const q=calculateDeliveryQuote(fixture());
 assert.equal(q.fee_cents,1500);assert.equal(q.payout_cents,1000);assert.equal(q.weight_grams,1000);assert.equal(q.route_distance_m,2100);
});
test("missing or invalid inputs fail closed",()=>{
 for(const patch of [{pickup:null},{dropoff:{lat:91,lon:0}},{routeDistanceM:0},{routeDistanceM:NaN},{items:[]},{items:[{quantity:2}]},{items:[{weightGrams:400,quantity:0}]}])assert.throws(()=>calculateDeliveryQuote({...fixture(),...patch}));
});
