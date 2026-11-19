import { createAuthClient } from "https://esm.sh/@neon/auth@latest";
const auth=createAuthClient(new URL("/auth",location.origin).href);
const $=id=>document.getElementById(id);
const dialog=$("registerShop");
let pending=null;
function status(message){$("registrationStatus").textContent=message}
function setBusy(busy){$("shopRegistrationForm").querySelector('button[type="submit"]').disabled=busy;$("confirmRegistration").disabled=busy}
$("openShopRegistration").addEventListener("click",event=>{event.preventDefault();dialog.showModal()});
$("closeRegistration").addEventListener("click",()=>dialog.close());
$("shopRegistrationForm").addEventListener("submit",async event=>{
 event.preventDefault();status("Creating your owner account and sending the confirmation email…");
 const email=$("regEmail").value.trim().toLowerCase(),password=$("regPassword").value;
 if(password!==$("regPasswordConfirm").value){status("Passwords do not match.");return}
 if(password.length<12){status("Use a password with at least 12 characters.");return}
 pending={email,password,application:{ownerName:$("regOwnerName").value.trim(),shopName:$("regShopName").value.trim(),phone:$("regPhone").value.trim(),area:$("regArea").value,address:$("regAddress").value.trim(),description:$("regDescription").value.trim()}};
 setBusy(true);
 try{
  const created=await auth.signUp.email({email,password,name:pending.application.ownerName});
  if(created.error)throw Error(created.error.message);
  const sent=await auth.emailOtp.sendVerificationOtp({email,type:"email-verification"});
  if(sent.error)throw Error(sent.error.message);
  $("verifyRegistration").hidden=false;
  $("regOtp").focus();
  status("A confirmation code has been sent to "+email+". Enter it below to verify your email and submit your shop application.");
 }catch(error){pending=null;status("Registration could not be completed: "+error.message)}
 finally{setBusy(false)}
});
$("confirmRegistration").addEventListener("click",async()=>{
 if(!pending){status("Please complete the registration form first.");return}
 const otp=$("regOtp").value.trim();
 if(!otp){status("Enter the confirmation code from your email.");return}
 setBusy(true);status("Verifying your email and submitting your shop application…");
 let signedIn=false;
 try{
  const verified=await auth.emailOtp.verifyEmail({email:pending.email,otp});
  if(verified.error)throw Error(verified.error.message);
  const signed=await auth.signIn.email({email:pending.email,password:pending.password});
  if(signed.error)throw Error(signed.error.message);
  signedIn=true;
  const response=await fetch(new URL("/auth/token",location.origin),{method:"GET",credentials:"include",cache:"no-store",headers:{accept:"application/json"}});
  const tokenData=await response.json();
  const token=tokenData?.token??tokenData?.data?.token;
  if(!response.ok||typeof token!=="string"||!token.split(".").length===3)throw Error("Email verified, but the secure application service could not be reached. Please contact support before retrying.");
  const submitted=await fetch("/api/shop-applications",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify(pending.application),cache:"no-store"});
  const result=await submitted.json();
  if(!submitted.ok)throw Error(result.error||"Shop application could not be submitted.");
  await auth.signOut();signedIn=false;pending=null;
  $("shopRegistrationForm").reset();$("verifyRegistration").hidden=true;
  status("Email verified and application submitted successfully. Your application is now awaiting administrator approval. You can sign in to the Shop Owner Dashboard only after approval.");
 }catch(error){
  if(signedIn)await auth.signOut().catch(()=>{});
  status(error.message);
 }finally{setBusy(false)}
});
