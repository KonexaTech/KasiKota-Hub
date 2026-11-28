// Anonymous customer credentials are 256-bit, browser-generated random secrets.
// Never accept a guest credential for owner or administrator API routes.
const orderId="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const orderRead=new RegExp("^/api/orders/"+orderId+"(?:/(?:items|history|delivery))?$","i");
const orderProof=new RegExp("^/api/orders/"+orderId+"/delivery-verification$","i");
const readNotification=new RegExp("^/api/notifications/"+orderId+"/read$","i");

export function guestRouteAllowed(method,path){
  return (method==="POST"&&(path==="/api/orders"||orderProof.test(path))) ||
    (method==="GET"&&(path==="/api/orders/mine"||path==="/api/notifications"||orderRead.test(path))) ||
    (method==="PATCH"&&readNotification.test(path));
}

export async function verifiedGuestSubject(request){
  const match=/^Guest ([a-f0-9]{64})$/.exec(request.headers.get("authorization")||"");
  if(!match)return null;
  const bytes=new Uint8Array(match[1].match(/.{2}/g).map(value=>parseInt(value,16)));
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  return "guest:"+Array.from(digest,value=>value.toString(16).padStart(2,"0")).join("");
}
