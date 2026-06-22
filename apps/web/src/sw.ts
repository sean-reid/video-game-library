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

// Push payloads come from a server we don't control yet. Treat everything as
// untrusted: validate shape, clamp strings, and resolve URLs same-origin so a
// hostile push can't drive `clients.openWindow` to a foreign or `javascript:`
// destination on click.
interface PushPayload {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
}

const MAX_TITLE = 120;
const MAX_BODY = 400;
const MAX_TAG = 64;
const DEFAULT_TITLE = 'A tracked game is out';
const DEFAULT_BODY = 'Check your Library.';
const DEFAULT_TAG = 'game-release';
const FALLBACK_URL = './';

function clampString(value: unknown, max: number, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  return trimmed.slice(0, max);
}

// Only accept URLs that resolve to our own origin. Relative paths are kept
// as-is; absolute URLs must be http(s) and match the SW's origin. Anything
// else falls back to the app root.
function safeNotificationUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return FALLBACK_URL;
  try {
    const resolved = new URL(value, self.registration.scope);
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
      return FALLBACK_URL;
    }
    if (resolved.origin !== self.location.origin) return FALLBACK_URL;
    return resolved.href;
  } catch {
    return FALLBACK_URL;
  }
}

self.addEventListener('push', (event) => {
  let raw: unknown = null;
  try {
    raw = event.data ? event.data.json() : null;
  } catch {
    /* malformed payload — leave raw as null, defaults below */
  }
  const data: PushPayload = raw && typeof raw === 'object' ? raw : {};
  const title = clampString(data.title, MAX_TITLE, DEFAULT_TITLE);
  const body = clampString(data.body, MAX_BODY, DEFAULT_BODY);
  const tag = clampString(data.tag, MAX_TAG, DEFAULT_TAG);
  const url = safeNotificationUrl(data.url);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data as { url?: unknown } | undefined;
  // Re-validate at click time: a stale notification persisted from a prior
  // SW version might carry an untrusted URL.
  const url = safeNotificationUrl(data?.url);
  event.waitUntil(self.clients.openWindow(url));
});
