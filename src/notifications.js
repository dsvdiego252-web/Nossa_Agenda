import { supabase } from './backend.js';
const marker = id => 'push-reminders:' + id;
export function enabled(id) { return localStorage.getItem(marker(id)) === 'yes' && 'Notification' in window && Notification.permission === 'granted'; }
function checkSupport() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Abra no Chrome atualizado. No iPhone, instale na Tela de Início e abra por lá.');
  if (!supabase) throw new Error('Notificações exigem uma conta conectada.');
}
async function worker(upgrade = false) {
  const registration = await navigator.serviceWorker.getRegistration();
  if(!registration?.active) throw new Error('A agenda está preparando a instalação. Atualize a página e tente novamente.');
  if (upgrade) {
    await registration.update();
    const next = registration.installing || registration.waiting;
    if (next) await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { cleanup(); reject(new Error('Feche e reabra a agenda para concluir a atualização.')); }, 20000);
      const cleanup = () => { clearTimeout(timeout); next.removeEventListener('statechange', changed); };
      const changed = () => {
        if (next.state === 'installed') next.postMessage({ type: 'ACTIVATE_PUSH' });
        if (next.state === 'activated') { cleanup(); resolve(); }
        if (next.state === 'redundant') { cleanup(); reject(new Error('Atualize a agenda e tente novamente.')); }
      };
      next.addEventListener('statechange', changed); changed();
    });
  }
  return registration;
}
function decodeKey(value) { return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)); }
async function register(subscription) {
  const json=subscription.toJSON();
  const {data,error}=await supabase.rpc('agenda_familiar_register_push',{p_endpoint:json.endpoint,p_p256dh:json.keys.p256dh,p_auth:json.keys.auth});
  if(error) throw new Error('Não foi possível registrar este aparelho. Confira a internet e entre novamente.');
  return data;
}
export async function disableReminders(id) {
  if(!supabase || !('serviceWorker' in navigator)) return;
  const registration=await navigator.serviceWorker.getRegistration();
  const subscription=await registration?.pushManager?.getSubscription();
  if(subscription) {
    const {error}=await supabase.from('agenda_familiar_push_subscriptions').delete().eq('endpoint',subscription.endpoint);
    if(error) throw new Error('Conecte-se à internet para desativar os lembretes deste aparelho antes de sair.');
    await subscription.unsubscribe();
  }
  localStorage.removeItem(marker(id)); localStorage.removeItem('reminders:'+id);
}
export async function toggleReminders(id) {
  if(enabled(id)) { await disableReminders(id); return false; }
  checkSupport();
  // Permission is requested directly from the user gesture.
  const permission=await Notification.requestPermission();
  if(permission!=='granted') throw new Error('Permita notificações nas configurações do Chrome/Android para esta agenda.');
  const response=await fetch('/api/push-config',{cache:'no-store'});
  if(!response.ok) throw new Error('O serviço de lembretes está indisponível. Tente novamente em instantes.');
  const {publicKey}=await response.json();
  const registration=await worker(true);
  let subscription=await registration.pushManager.getSubscription();
  const key=decodeKey(publicKey);
  if(subscription?.options.applicationServerKey && String(new Uint8Array(subscription.options.applicationServerKey))!==String(key)) { await subscription.unsubscribe(); subscription=null; }
  subscription ||= await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  await register(subscription);
  localStorage.setItem(marker(id),'yes'); localStorage.removeItem('reminders:'+id);
  return true;
}
export async function restorePush(store) {
  if(!store || store.preview || !enabled(store.key)) return;
  try {
    const subscription=await (await worker()).pushManager.getSubscription();
    if(!subscription) { localStorage.removeItem(marker(store.key)); return; }
    await register(subscription);
  } catch { /* Offline: keep current subscription and allow an explicit retry in settings. */ }
}
export async function testNotification(id) {
  checkSupport();
  if(!enabled(id)) throw new Error('Ative os lembretes neste aparelho primeiro.');
  const subscription=await (await worker()).pushManager.getSubscription();
  if(!subscription) { localStorage.removeItem(marker(id)); throw new Error('Ative os lembretes novamente.'); }
  const subscriptionId=await register(subscription);
  const {error}=await supabase.rpc('agenda_familiar_test_push',{p_subscription:subscriptionId});
  if(error) throw new Error('Não foi possível agendar o teste. Aguarde um minuto e tente novamente.');
}
