// Service worker : installation de l'application (PWA) et ouverture rapide hors ligne.
const CACHE = 'alefa-v46';
const SHELL = ['/', '/css/app.css', '/js/app.js', '/js/core.js', '/js/client.js', '/js/courier.js', '/js/admin.js', '/js/colis.js', '/js/terms.js', '/js/home.js', '/css/home.css', '/js/space.js', '/js/wizard.js', '/js/talk.js', '/css/space.css', '/css/admin.css', '/js/centralia-kit.js', '/icon.svg', '/manifest.webmanifest', '/manifest-livreur.webmanifest'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Réseau d'abord (toujours la dernière version), cache en secours.
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('/'))));
});

// Notification push (envoyée par le serveur) : affichée même quand le site est fermé.
// Si l'application est ouverte et visible, elle l'affiche déjà elle-même (bandeau + son) : pas de doublon.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() || '' }; }
  const call = d.tag === 'call';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    if (!call && list.some((c) => c.visibilityState === 'visible')) return null;
    return self.registration.showNotification(d.title || 'Alefa.mg', {
      body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag || undefined, renotify: !!d.tag,
      vibrate: call ? [400, 200, 400, 200, 400, 200, 400] : [200, 100, 200], requireInteraction: call || d.tag === 'sos',
      data: { url: d.url || '/' },
    });
  }));
});

// Clic sur une notification : on remet l'application au premier plan (ou on l'ouvre) sur la bonne page.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list.find((c) => 'focus' in c && new URL(c.url).pathname.startsWith(new URL(url).pathname.replace(/\/$/, '') || '/'));
    if (w) return w.focus();
    return self.clients.openWindow(url);
  }));
});
