import { writeFile } from 'node:fs/promises';
import webpush from 'web-push';
const keys = webpush.generateVAPIDKeys();
await writeFile('.env.push-production', `AGENDA_VAPID_PUBLIC_KEY=${keys.publicKey}\nAGENDA_VAPID_PRIVATE_KEY=${keys.privateKey}\n`, { flag: 'wx', mode: 0o600 });
console.log('Chaves salvas em .env.push-production (ignorado pelo Git). Importe na Vercel. Preserve este arquivo; trocar as chaves exige reativar os aparelhos.');
