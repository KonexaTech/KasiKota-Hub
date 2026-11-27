// Invoke only from an explicit location button, never on page load.
export function captureDeliveryLocation(geolocation=globalThis.navigator?.geolocation) {
  return new Promise((resolve,reject)=>{
    if (!geolocation) return reject(new Error("Location is unavailable on this device."));
    geolocation.getCurrentPosition(position=>{
      const {latitude,longitude,accuracy}=position.coords;
      if (![latitude,longitude,accuracy,position.timestamp].every(Number.isFinite) ||
          Math.abs(latitude)>90 || Math.abs(longitude)>180 || accuracy<0 || accuracy>100 ||
          Math.abs(Date.now()-position.timestamp)>90000)
        return reject(new Error("Location is not accurate or recent enough. Try again outdoors."));
      resolve({lat:latitude,lon:longitude,accuracyM:accuracy,capturedAt:position.timestamp});
    },()=>reject(new Error("Location could not be captured. Check location permission and try again.")),
    {enableHighAccuracy:true,maximumAge:0,timeout:20000});
  });
}
