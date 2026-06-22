import { PER_SOURCE_TIMEOUT_MS } from '../config';

const USER_AGENT =
  'VGL-News-Worker/1.0 (https://github.com/danrstaton/video-game-library)';

export async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort();
  }, PER_SOURCE_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`${url} returned ${String(r.status)}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

const MAX_REDIRECT_HOPS = 5;

// SSRF guard: only follow redirects when the resolved Location still passes
// the caller's allowlist. Without this, an allowed source returning a 302 to
// a private/internal target would be followed unchecked. We walk one hop at a
// time so every Location goes through the same allow check.
export async function fetchTextWithAllowlistedRedirects(
  url: string,
  allow: (candidate: string) => boolean,
): Promise<string> {
  let current = url;
  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    if (!allow(current)) throw new Error(`URL not allowed: ${current}`);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      ctrl.abort();
    }, PER_SOURCE_TIMEOUT_MS);
    try {
      const r = await fetch(current, {
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'manual',
        signal: ctrl.signal,
      });
      if (r.status >= 300 && r.status < 400) {
        const location = r.headers.get('Location');
        if (!location)
          throw new Error(`${current} returned ${String(r.status)} without Location`);
        current = new URL(location, current).toString();
        continue;
      }
      if (!r.ok) throw new Error(`${current} returned ${String(r.status)}`);
      return await r.text();
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Too many redirects from ${url}`);
}
