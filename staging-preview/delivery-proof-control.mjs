// Ephemeral proof display: never persist codes, and discard late responses after account/order changes.
export function mountDeliveryProof({after,label,purpose,request,currentOrder}){
 const button=document.createElement('button'),output=document.createElement('p');
 button.type='button';button.textContent=label;button.hidden=true;
 output.setAttribute('role','status');output.setAttribute('aria-live','polite');
 after.after(button,output);
 let id='',epoch=0,timer=null,pending=false,allowed=false;
 const clear=()=>{epoch++;clearTimeout(timer);timer=null;output.textContent='';pending=false;button.disabled=false;};
 const update=(next,enabled)=>{if(next!==id||!enabled)clear();id=next;allowed=enabled===true;button.hidden=!allowed;};
 button.addEventListener('click',async()=>{
  if(pending||!allowed||!id)return;
  clear();pending=true;button.disabled=true;
  const revision=epoch,order=id;
  try{
   const data=await request(order);
   if(revision!==epoch||currentOrder()!==order||document.hidden||!allowed)return;
   if(!data||!/^\d{6}$/.test(data.pin)||data.purpose!==purpose||data.expires_in!==900)throw Error('Invalid verification response');
   output.textContent=(purpose==='collection'?'Pickup code: ':'Handover code: ')+data.pin+'. Share only with the assigned driver at '+(purpose==='collection'?'shop pickup':'your delivery')+'. Expires in 15 minutes.';
   timer=setTimeout(clear,900000);
  }catch(e){if(revision===epoch&&currentOrder()===order&&!document.hidden)output.textContent=e.message||'Verification unavailable. Ask the delivery administrator to review.';}
  finally{if(revision===epoch){pending=false;button.disabled=false;}}
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
 window.addEventListener('pagehide',clear);window.addEventListener('storage',clear);
 return {update,clear};
}
