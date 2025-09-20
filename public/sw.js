const CACHE = 'master-cache-v1';
// Įrašyk tik realiai esančius failus:
const CORE = [
  './mobilev4.html',
  './manifest.webmanifest'
  // Jei ikonos tikrai yra – pridėk:
  // './icon-192.png',
  // './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      for (const url of CORE) {
        try { await c.add(url); }
        catch (err) { console.warn('⚠️ skip precache', url, err?.message || err); }
      }
      // Nebemėtom klaidos dėl vieno 404
    })()
  );
});

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return resp;
    }))
  );
});

// (jei naudojamas) push:
self.addEventListener('push', (e) => {
  const data = (e.data && e.data.json && e.data.json()) || {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'Naujas pranešimas', {
      body: data.body || 'Yra naujienų jūsų užduotyse.'
      // icon: './icon-192.png' // įjunk tik kai failas tikrai egzistuoja
    })
  );
});
