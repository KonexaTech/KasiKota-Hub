// Staging only. Send coordinates only, never customer identity or address.
export async function cyclingRouteDistance({pickup,dropoff,apiKey,fetcher=fetch}){
 if(typeof apiKey!=="string"||!apiKey.trim())throw Error("ROUTING_UNAVAILABLE");
 for(const p of [pickup,dropoff])if(!p||!Number.isFinite(p.lat)||Math.abs(p.lat)>90||!Number.isFinite(p.lon)||Math.abs(p.lon)>180)throw Error("INVALID_LOCATION");
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),8000);
 try{
 const response=await fetcher("https://api.heigit.org/openrouteservice/v2/directions/cycling-regular/json",{method:"POST",headers:{Authorization:apiKey,"Content-Type":"application/json"},body:JSON.stringify({coordinates:[[pickup.lon,pickup.lat],[dropoff.lon,dropoff.lat]]}),signal:controller.signal,redirect:"manual"});
 if(!response.ok)throw Error("ROUTING_UNAVAILABLE");
 const data=await response.json();
 const distance=data?.routes?.[0]?.summary?.distance;
 if(!Number.isFinite(distance)||distance<=0||distance>2147483647)throw Error("ROUTING_UNAVAILABLE");
 return Math.ceil(distance);
 }catch{throw Error("ROUTING_UNAVAILABLE")}finally{clearTimeout(timer)}
}
