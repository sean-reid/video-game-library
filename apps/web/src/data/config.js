// localStorage keys. Wire-stable contracts — never rename without a
// migration; existing users' libraries are keyed on these strings.
export const STORAGE_KEY = 'vgl.games.v4';
export const GIST_KEY = 'vgl.gistSync.v1';
export const READ_KEY = 'vgl.readArticles.v1';
export const DISMISSED_KEY = 'vgl.dismissedBanners.v1';
export const RECS_KEY = 'vgl.recs.v1';

// External endpoints. WORKER_BASE is overridable via VITE_WORKER_URL at
// build time so dev builds can hit the dev worker without code changes.
// Falls back to the live production worker that ships with the codeowner's
// repo so a fresh clone Just Works.
export const WORKER_BASE =
  import.meta.env.VITE_WORKER_URL ?? 'https://vgl-news.danrstaton.workers.dev';

// RAWG access. The client-side key here is a known security issue and gets
// retired in the security-hardening phase when all RAWG calls move through
// the worker's /rawg/* proxy. Kept for parity with the legacy single-file
// app while components are still being extracted.
export const RAWG_KEY = '3be9c7521f9649109c0216049bcf7049';
export const RAWG_BASE = 'https://api.rawg.io/api';

// TTLs and floors used by client-side caches.
export const NEWS_STALE_MS = 30 * 60 * 1000; // 30 min
export const RECS_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
export const REC_METACRITIC_FLOOR = 75;
