// ImportTrack Service Worker
const CACHE_NAME = 'importtrack-v1';

// Ressources à mettre en cache immédiatement
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // On pré-cache ce qu'on peut, sans bloquer si certaines ressources échouent
      return Promise.allSettled(
        PRECACHE.map(url => cache.add(url).catch(() => {}))
      );
    })
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Supabase API → toujours réseau (jamais de cache pour les données)
  if (url.hostname.includes('supabase.co')) {
    return event.respondWith(fetch(request));
  }

  // Fonts Google → cache en priorité
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // App shell (HTML, JS, CSS) → Cache First avec fallback réseau
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request)
          .then(response => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached); // Si offline → retourne le cache

        // Network first pour index.html (pour avoir les mises à jour)
        if (url.pathname === '/' || url.pathname === '/index.html') {
          return networkFetch.catch(() => cached);
        }

        return cached || networkFetch;
      })
    );
  }
});

// ── PAGE OFFLINE ─────────────────────────────────────────────
// Si l'app est ouverte sans connexion et sans cache, on affiche un message simple
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html').then(cached => {
          if (cached) return cached;
          return new Response(`
            <!DOCTYPE html>
            <html lang="fr">
            <head><meta charset="UTF-8"><title>ImportTrack — Hors ligne</title>
            <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#F7F5F2;color:#1C1917;}
            .box{text-align:center;padding:40px;}.box h2{font-size:20px;margin-bottom:8px;color:#2563EB;}
            .box p{color:#78716C;font-size:14px;}</style></head>
            <body><div class="box">
              <h2>ImportTrack</h2>
              <p>Vous êtes hors ligne.<br>Reconnectez-vous pour accéder à vos données.</p>
            </div></body></html>
          `, { headers: { 'Content-Type': 'text/html' } });
        })
      )
    );
  }
});
