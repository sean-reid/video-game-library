import { PER_SOURCE_TIMEOUT_MS } from '../config';

export async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort();
  }, PER_SOURCE_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'VGL-News-Worker/1.0 (https://github.com/danrstaton/video-game-library)',
      },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`${url} returned ${String(r.status)}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}
