const CACHE = 'agenda-shell-__CACHE_VERSION__';
const ASSETS = __PRECACHE__;
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_PUSH') event.waitUntil(self.skipWaiting());
});
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('agenda-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Nunca armazene respostas da API, tokens ou páginas de outros domínios.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then(hit => hit || fetch(event.request)));
  }
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then(async clients => {
    if (clients.length) return clients[0].focus();
    return self.clients.openWindow('/');
  }));
});


self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch {}
  event.waitUntil(self.registration.showNotification(payload.title || 'Agenda Familiar', {
    body: payload.body || 'Você tem um lembrete na agenda.',
    tag: payload.tag || 'agenda-reminder', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    data: { url: '/' }
  }));
});
