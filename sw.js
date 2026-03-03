const CACHE_NAME = 'grafik-v3';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon192.png',// upewnij się, że masz jakąś ikonę
    './icon512.png'
];

// 1. Instalacja - cachowanie plików
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('SW: Buforowanie zasobów');
            return cache.addAll(ASSETS);
        })
    );
});

// 2. Aktywacja - czyszczenie starych wersji cache
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
});

// 3. Przechwytywanie zapytań (Strategia Cache-First)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
