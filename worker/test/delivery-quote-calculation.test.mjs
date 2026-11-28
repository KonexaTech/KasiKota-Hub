import test from "node:test";
import assert from "node:assert/strict";
import {calculateDeliveryQuote} from "../src/delivery-quote-calculation.js";
const fixture=()=>({pickup:{lat:-27.75,lon:29.93},dropoff:{lat:-27.76,lon:29.94},routeDistanceM:1000,items:[{weightGrams:400,quantity:2},{weightGrams:200,quantity:1}]});
test("staging quote calculates server tariff and aggregate weight",()=>{
 const q=calculateDeliveryQuote(fixture());
 assert.equal(q.fee_cents,1500);assert.equal(q.payout_cents,1050);assert.equal(q.weight_grams,1000);assert.equal(q.route_distance_m,1000);
});
test("missing or invalid inputs fail closed",()=>{
 for(const patch of [{pickup:null},{dropoff:{lat:91,lon:0}},{routeDistanceM:0},{routeDistanceM:NaN},{items:[]},{items:[{quantity:2}]},{items:[{weightGrams:400,quantity:0}]}])assert.throws(()=>calculateDeliveryQuote({...fixture(),...patch}));
});

test("bicycle tariff boundaries and exact driver share",()=>{for(const [distance,fee,payout] of [[1,500,350],[299,500,350],[300,1000,700],[699,1000,700],[700,1500,1050],[1000,1500,1050]]){const q=calculateDeliveryQuote({...fixture(),routeDistanceM:distance});assert.equal(q.fee_cents,fee);assert.equal(q.payout_cents,payout);}assert.throws(()=>calculateDeliveryQuote({...fixture(),routeDistanceM:1001}),/BICYCLE_DISTANCE_EXCEEDED/);});
