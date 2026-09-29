import { authorized,runPush } from '../server/push.js';
export const config={maxDuration:60};
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  if(!authorized(req.headers.authorization,process.env.AGENDA_PUSH_TOKEN)) return res.status(401).json({error:'NOT_AUTHORIZED'});
  try { return res.status(200).json(await runPush()); }
  catch { return res.status(503).json({error:'PUSH_UNAVAILABLE'}); }
}
