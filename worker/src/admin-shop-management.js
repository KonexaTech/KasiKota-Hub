import { isNeonAdmin } from './neon-auth.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
class DecisionError extends Error { constructor(status,message) { super(message);this.status=status; } }
const unavailable = () => json({error:'Shop management is unavailable. No decision was saved.'},503);
const fields = 'id,request_id,shop_id,actor_subject,previous_approved,approved,reason,created_at';

// The caller supplies the already verified, email-verified, unsuspended subject.
// We independently require membership in the server-side administrator table.
export async function adminShopManagement(request,env,withDb,subject) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  const capability = path === '/api/admin/shop-management' && method === 'GET';
  const decision = /^\/api\/admin\/shops\/([0-9a-f-]{36})\/approval$/i.exec(path);
  const history = /^\/api\/admin\/shops\/([0-9a-f-]{36})\/approval-events$/i.exec(path);
  if (!capability && !(decision&&method==='PATCH') && !(history&&method==='GET')) return null;
  if (!subject) return json({error:'Sign in with Neon Auth'},401);
  if (!await isNeonAdmin(env,withDb,subject)) return json({error:'Admin access required'},403);
  if (env.KOTA_SHOP_ADMIN_ENABLED !== 'true') return capability ? json({available:false}) : unavailable();
  try {
    if (capability) {
      await withDb(env,db=>db.query('SELECT id FROM kc_shop_admin_events LIMIT 0'));
      return json({available:true});
    }
    if (history) {
      if (!uuid.test(history[1])) return json({error:'Invalid shop ID'},400);
      const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 50;
      if (!Number.isInteger(limit)||limit<1||limit>100) return json({error:'Invalid history limit'},400);
      const events = await withDb(env,async db=>(await db.query(`SELECT ${fields} FROM kc_shop_admin_events WHERE shop_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2`,[history[1].toLowerCase(),limit])).rows);
      return json({events});
    }
    let body;
    try {
      const reader=request.body?.getReader(),chunks=[];let size=0;
      if(!reader)return json({error:'Invalid shop decision'},400);
      try {
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return json({error:'Shop decision too large'},413);}chunks.push(value);}
      } finally {reader.releaseLock();}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    } catch { return json({error:'Invalid shop decision'},400); }
    const keys=['approved','expectedCurrentApproved','reason','requestId'];
    if (!uuid.test(decision[1])||!body||Array.isArray(body)||Object.keys(body).sort().join(',')!==keys.join(',')||typeof body.requestId!=='string'||!uuid.test(body.requestId)||typeof body.approved!=='boolean'||typeof body.expectedCurrentApproved!=='boolean'||body.approved===body.expectedCurrentApproved||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>500) return json({error:'Invalid shop decision'},400);
    const shopId=decision[1].toLowerCase(),requestId=body.requestId.toLowerCase(),reason=body.reason.trim();
    const result=await withDb(env,async db=>{
      await db.query('BEGIN');
      try {
        // One administrator request ID cannot race across different shop rows.
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`kc-shop-management:${subject}:${requestId}`]);
        const previous=(await db.query(`SELECT ${fields} FROM kc_shop_admin_events WHERE actor_subject=$1 AND request_id=$2`,[subject,requestId])).rows[0];
        if (previous) {
          if(previous.shop_id!==shopId||previous.approved!==body.approved||previous.previous_approved!==body.expectedCurrentApproved||previous.reason!==reason) throw new DecisionError(409,'Request ID already used for another shop decision');
          await db.query('COMMIT');
          return {ok:true,replayed:true,event:previous};
        }
        const shop=(await db.query('SELECT id,approved,owner_subject FROM kc_shops WHERE id=$1 FOR UPDATE',[shopId])).rows[0];
        if (!shop) throw new DecisionError(404,'Shop not found');
        if (shop.approved!==body.expectedCurrentApproved) throw new DecisionError(409,'Shop approval changed. Refresh the dashboard before making another decision.');
        await db.query('UPDATE kc_shops SET approved=$1 WHERE id=$2',[body.approved,shopId]);
        const event=(await db.query(`INSERT INTO kc_shop_admin_events(request_id,shop_id,actor_subject,previous_approved,approved,reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${fields}`,[requestId,shopId,subject,shop.approved,body.approved,reason])).rows[0];
        // Existing notification kind: preserve the inspected database CHECK.
        await db.query("INSERT INTO kc_notifications(recipient_subject,kind,title,body) VALUES($1,'application_status',$2,$3)",[shop.owner_subject,body.approved?'Shop approval restored':'Shop suspended',reason]);
        await db.query('COMMIT');
        return {ok:true,replayed:false,event};
      } catch(error) { await db.query('ROLLBACK');throw error; }
    });
    return json(result);
  } catch(error) {
    if (error instanceof DecisionError) return json({error:error.message},error.status);
    // Schema/permission dependencies must never produce a false saved-state response.
    if (error?.code==='42P01'||error?.code==='42501') return capability ? json({available:false}) : unavailable();
    throw error;
  }
}
