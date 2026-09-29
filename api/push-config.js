import { pushConfig } from '../server/push.js';
export default function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  try { return res.status(200).json({publicKey:pushConfig().AGENDA_VAPID_PUBLIC_KEY}); }
  catch { return res.status(503).json({error:'Os lembretes no servidor ainda não estão configurados.'}); }
}
