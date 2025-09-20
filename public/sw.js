self.addEventListener('install', e => {
    e.waitUntil(
        caches.open('master-cache-v1').then(cache =>
            cache.addAll(['/', '/mobilev5.html', '/icon-192.png'])
        )
    );
});

self.addEventListener('fetch', e => {
    e.respondWith(
        caches.match(e.request).then(r => r || fetch(e.request))
    );
});

self.addEventListener('push', e => {
    const data = e.data?.json() || {};
    const title = data.title || 'Naujas darbas';
    const options = {
        body: data.body || 'Turite naują pretenziją.',
        icon: '/icon-192.png',
        badge: '/icon-192.png'
    };
    e.waitUntil(
        self.registration.showNotification(title, options)
    );
});
