import { occurrences, todayInBrasilia, addDays } from './dates.js';
export function enabled(id) { return localStorage.getItem('reminders:' + id) === 'yes'; }
export async function toggleReminders(id) {
  if (enabled(id)) { localStorage.removeItem('reminders:' + id); return false; }
  if (!('Notification' in window)) throw new Error('Este navegador não oferece notificações. No iPhone, instale na tela inicial e abra por lá.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permissão não concedida. Verifique as configurações do navegador.');
  localStorage.setItem('reminders:' + id, 'yes'); return true;
}
export async function checkReminders(store) {
  if (!store || store.closed || !enabled(store.key) || !('Notification' in window) || Notification.permission !== 'granted') return;
  const today = todayInBrasilia();
  const key = 'notified:' + store.key;
  const sent = JSON.parse(localStorage.getItem(key) || '{}');
  const now = Date.now();
  for (const event of occurrences(store.state.events, today, addDays(today, 2))) {
    if (event.reminder < 0) continue;
    const due = Date.parse(event.occurrence + 'T' + event.start_time + ':00-03:00') - event.reminder * 60000;
    const tag = event.id + ':' + event.occurrence + ':' + event.version + ':' + event.reminder;
    if (now >= due && now - due < 60000 && !sent[tag]) {
      const options = { body: event.start_time + ' · ' + event.owner, tag, icon: '/icons/icon-192.png' };
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration) await registration.showNotification(event.title, options);
      else new Notification(event.title, options);
      sent[tag] = now;
    }
  }
  localStorage.setItem(key, JSON.stringify(Object.fromEntries(Object.entries(sent).filter(([,time]) => now - time < 172800000))));
}

