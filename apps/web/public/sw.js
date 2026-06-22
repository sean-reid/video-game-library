// Service Worker — enables Web Push notifications when set up with a backend.
// For now, just a foundation: install, activate, and handlers for push events.
// (Add Cloudflare Worker + cron later to actually deliver pushes.)

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// When a push arrives from a backend, show a system notification.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || 'A tracked game is out';
  const body = data.body || 'Check your Library.';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: data.tag || 'game-release',
      data: { url: data.url || './' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || './';
  event.waitUntil(self.clients.openWindow(url));
});
