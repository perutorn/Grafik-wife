const CACHE_NAME = 'grafik-wife-v3';
// Ponieważ wszystko jest w index.html, potrzebujesz tylko jego i manifestu
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon192.png',
    './icon512.png'
];

// 1. Instalacja
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('SW: Buforowanie monolitu index.html');
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting(); // Wymusza aktywację nowej wersji od razu
});

// 2. Aktywacja
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

// 3. Obsługa zapytań
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            // Zwróć z cache, a jeśli nie ma (np. nowe ikony), pobierz z sieci
            return response || fetch(event.request);
        })
    );
});
