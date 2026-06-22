/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';
import type { PrecacheEntry } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | PrecacheEntry)[];
};

// vite-plugin-pwa injects the precache manifest here at build time.
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

interface PushPayload {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {};
  try {
    data = event.data ? (event.data.json() as PushPayload) : {};
  } catch {
    /* malformed payload — fall back to defaults below */
  }
  const title = data.title ?? 'A tracked game is out';
  const body = data.body ?? 'Check your Library.';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: data.tag ?? 'game-release',
      data: { url: data.url ?? './' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data as { url?: string } | undefined;
  const url = data?.url ?? './';
  event.waitUntil(self.clients.openWindow(url));
});
