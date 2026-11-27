// Private staging quote calculation. Route distance must come from a trusted routing adapter.
export function calculateDeliveryQuote({pickup,dropoff,routeDistanceM,items}) {
  for (const point of [pickup,dropoff]) {
    if (!point || !Number.isFinite(point.lat) || Math.abs(point.lat)>90 ||
        !Number.isFinite(point.lon) || Math.abs(point.lon)>180) throw new Error("INVALID_LOCATION");
  }
  if (!Number.isSafeInteger(routeDistanceM) || routeDistanceM<=0 || routeDistanceM>2147483647) throw new Error("INVALID_ROUTE");
  if (!Array.isArray(items)||!items.length||items.length>30) throw new Error("INVALID_ITEMS");
  let weight=0;
  for (const item of items) {
    if (!item || !Number.isSafeInteger(item.weightGrams)||item.weightGrams<=0 ||
        !Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>50) throw new Error("MISSING_WEIGHT");
    weight+=item.weightGrams*item.quantity;
    if (!Number.isSafeInteger(weight)||weight>2147483647) throw new Error("INVALID_WEIGHT");
  }
  return {pickup_lat:pickup.lat,pickup_lon:pickup.lon,dropoff_lat:dropoff.lat,dropoff_lon:dropoff.lon,
    route_distance_m:routeDistanceM,weight_grams:weight,currency:"ZAR",fee_cents:1500,payout_cents:1000};
}
