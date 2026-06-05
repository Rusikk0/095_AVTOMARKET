/**
 * Service Worker — АвтоЗапчасти PWA
 * Strategy: Cache-first for app shell, stale-while-revalidate for CDN
 */

var CACHE_VERSION = 'ap-v2';

// Auto-detect base path (works on GitHub Pages and localhost)
var BASE = new URL('./', self.location).pathname;

var APP_SHELL = [
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-512.png'
];

var APP_SCRIPTS = [
  BASE + 'js/config.js',
  BASE + 'js/supabase-init.js',
  BASE + 'js/ap-access.js',
  BASE + 'js/ap-auth.js',
  BASE + 'js/ap-db.js',
  BASE + 'js/ap-backup.js',
  BASE + 'js/ap-screens.js'
];

var CDN_SCRIPTS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/html5-qrcode/html5-qrcode.min.js'
];

// Install: cache the app shell + scripts
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      var urls = APP_SHELL.concat(APP_SCRIPTS).concat(CDN_SCRIPTS);
      return cache.addAll(urls).catch(function (err) {
        console.warn('[SW] Cache addAll error (non-critical):', err);
        // Cache what we can individually
        return Promise.all(urls.map(function (url) {
          return cache.add(url).catch(function () {});
        }));
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_VERSION; })
            .map(function (key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: serve from cache, fallback to network
self.addEventListener('fetch', function (event) {
  var request = event.request;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Supabase API calls (always go to network)
  var url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.hostname.includes('supabase.co')) return;

  event.respondWith(
    caches.match(request).then(function (cached) {
      // Stale-while-revalidate: return cached immediately, update in background
      var fetchPromise = fetch(request).then(function (networkResponse) {
        if (networkResponse && networkResponse.status === 200) {
          var copy = networkResponse.clone();
          caches.open(CACHE_VERSION).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return networkResponse;
      }).catch(function () {
        return null;
      });

      // If we have a cache hit, return it immediately and update in background
      if (cached) {
        // Update cache in background
        fetchPromise.catch(function () {});
        return cached;
      }

      // No cache hit: try network, then fallback to cache or offline page
      return fetchPromise.then(function (response) {
        if (response) return response;
        // Final fallback for navigation requests
        if (request.mode === 'navigate') {
          return caches.match(BASE + 'index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});

// Background sync: retry queued operations when back online
self.addEventListener('sync', function (event) {
  if (event.tag === 'sync-offline-queue') {
    event.waitUntil(
      // Notify clients to process their queue
      self.clients.matchAll().then(function (clients) {
        clients.forEach(function (client) {
          client.postMessage({ type: 'PROCESS_OFFLINE_QUEUE' });
        });
      })
    );
  }
});

// Listen for messages from clients
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
