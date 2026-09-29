import { timingSafeEqual } from 'node:crypto';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
export function validEndpoint(endpoint) {
  try { const u=new URL(endpoint); return u.protocol==='https:' && !u.port && !u.username && !u.password && !u.hash && (['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(u.hostname) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname)); } catch { return false; }
}
export function authorized(header, secret) {
  if (!secret || secret.length<64 || typeof header!=='string') return false;
  const a=Buffer.from(header), b=Buffer.from('Bearer '+secret);
  return a.length===b.length && timingSafeEqual(a,b);
}
export async function dispatch(db, token, send) {
  const {data:jobs,error}=await db.rpc('agenda_familiar_claim_push',{p_token:token});
  if(error) throw new Error('PUSH_QUEUE_UNAVAILABLE');
  const results=await Promise.all((jobs||[]).map(async job=>{
    let status=400;
    if(validEndpoint(job.subscription?.endpoint)) {
      try { await send(job.subscription,JSON.stringify(job.payload),{TTL:600,urgency:'high',timeout:10000}); status=201; }
      catch(error) { status=Number(error.statusCode)||503; }
    }
    const {error:finishError}=await db.rpc('agenda_familiar_finish_push',{p_token:token,p_id:job.id,p_lease:job.lease,p_status:status});
    if(finishError) throw new Error('PUSH_ACK_UNAVAILABLE');
    return status;
  }));
  return {claimed:results.length,sent:results.filter(s=>s===201).length,failed:results.filter(s=>s!==201).length};
}
export function pushConfig() {
  const env=process.env;
  if(!env.AGENDA_PUSH_TOKEN || !env.AGENDA_VAPID_PRIVATE_KEY || !env.AGENDA_VAPID_PUBLIC_KEY || !env.VITE_AGENDA_SUPABASE_URL || !env.VITE_AGENDA_SUPABASE_PUBLISHABLE_KEY) throw new Error('PUSH_NOT_CONFIGURED');
  return env;
}
export async function runPush() {
  const env=pushConfig();
  webpush.setVapidDetails('https://nossa-agenda-one.vercel.app',env.AGENDA_VAPID_PUBLIC_KEY,env.AGENDA_VAPID_PRIVATE_KEY);
  // Deliberately uses the public key + narrow scheduler token, never service_role.
  const db=createClient(env.VITE_AGENDA_SUPABASE_URL,env.VITE_AGENDA_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  return dispatch(db,env.AGENDA_PUSH_TOKEN,webpush.sendNotification.bind(webpush));
}
