import test from "node:test";
import assert from "node:assert/strict";
import {captureDeliveryLocation} from "../staging-preview/delivery-location.mjs";
const gps=(accuracy=20,timestamp=Date.now())=>({getCurrentPosition(ok,fail,options){assert.equal(options.maximumAge,0);ok({coords:{latitude:-27.75,longitude:29.93,accuracy},timestamp});}});
test("captures fresh coordinates",async()=>assert.equal((await captureDeliveryLocation(gps())).lat,-27.75));
test("rejects stale and inaccurate fixes",async()=>{await assert.rejects(captureDeliveryLocation(gps(101)));await assert.rejects(captureDeliveryLocation(gps(20,Date.now()-100000)));});
test("permission denial fails closed",async()=>assert.rejects(captureDeliveryLocation({getCurrentPosition(ok,fail){fail();}})));
