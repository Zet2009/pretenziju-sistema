// sw.js (paprastas app-shell cache + push)
const CACHE = 'master-cache-v1';
const CORE = ['./', './mobilev4.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
});

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).then((resp) => {
      const copy = resp.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(()=>{});
      return resp;
    }))
  );
});

self.addEventListener('push', (e) => {
  const data = (e.data && e.data.json && e.data.json()) || {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'Naujas pranešimas', {
      body: data.body || 'Yra naujienų jūsų užduotyse.',
      icon: './icon-192.png', // gali būti ir nebūti
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow('./mobilev4.html'));
});
