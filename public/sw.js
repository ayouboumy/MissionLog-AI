
const CACHE_NAME = 'missionlog-v4';

// 1. Assets we want to pin immediately (App Shell & critical externals)
// Note: In production, Vite hashes filenames. We handle those via runtime caching.
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  // External Libraries (Versioned/Immutable) - MUST MATCH index.html EXACTLY
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/pizzip@3.1.4/dist/pizzip.min.js',
  'https://unpkg.com/docxtemplater@3.37.11/build/docxtemplater.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js',
  // Fonts & Icons
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Tajawal:wght@300;400;500;700&display=swap',
  'https://cdn-icons-png.flaticon.com/512/9324/9324679.png',
  'https://cdn-icons-png.flaticon.com/128/9324/9324679.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching critical assets');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Exclude API calls (Google GenAI) from caching - always go to network
  if (url.pathname.includes('generativelanguage.googleapis.com')) {
    return;
  }

  // STRATEGY 1: Cache-First for External Libraries, Fonts, and Images
  // These are unlikely to change often or are versioned.
  const isExternalAsset = 
    PRECACHE_ASSETS.includes(url.href) || 
    url.hostname === 'cdn.tailwindcss.com' ||
    url.hostname === 'unpkg.com' ||
    url.hostname === 'cdnjs.cloudflare.com' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'cdn-icons-png.flaticon.com';

  if (isExternalAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          // Cache new external assets dynamically
          if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
           // Fallback or failures for externals
           console.log('[SW] Failed to fetch external asset offline:', url.href);
        });
      })
    );
    return;
  }

  // STRATEGY 2: Stale-While-Revalidate for App Shell (Local Origin)
  // This serves the cached version immediately (fast load), 
  // then updates the cache in the background for the NEXT visit.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          // Check if valid response
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        }).catch((err) => {
            console.log('[SW] Network fetch failed for app shell, offline mode active.');
        });

        // Return cached response immediately if available, else wait for network
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }
});
