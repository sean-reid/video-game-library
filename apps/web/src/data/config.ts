// localStorage keys. Wire-stable contracts — never rename without a
// migration; existing users' libraries are keyed on these strings.
export const STORAGE_KEY = 'vgl.games.v4';
export const GIST_KEY = 'vgl.gistSync.v1';
export const READ_KEY = 'vgl.readArticles.v1';
export const DISMISSED_KEY = 'vgl.dismissedBanners.v1';
export const RECS_KEY = 'vgl.recs.v1';
export const NEWS_CACHE_KEY = 'vgl.news.v2';

// External endpoints. WORKER_BASE is overridable via VITE_WORKER_URL at
// build time so dev builds can hit the dev worker without code changes.
// Falls back to the live production worker that ships with the codeowner's
// repo so a fresh clone Just Works. Forks running prod builds without an
// explicit override get a one-time console warning at module evaluation so
// they know they're routing traffic through the codeowner's deploy.
const CODEOWNER_WORKER_URL = 'https://vgl-news.danrstaton.workers.dev';
const configuredWorkerUrl = import.meta.env.VITE_WORKER_URL as string | undefined;
if (!configuredWorkerUrl && import.meta.env.PROD) {
  console.warn(
    `[vgl] VITE_WORKER_URL not set; falling back to ${CODEOWNER_WORKER_URL}. ` +
      `Set VITE_WORKER_URL at build time to point at your own deployment.`,
  );
}
export const WORKER_BASE: string = configuredWorkerUrl ?? CODEOWNER_WORKER_URL;

// TTLs and floors used by client-side caches.
export const NEWS_STALE_MS = 30 * 60 * 1000; // 30 min
export const RECS_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
export const REC_METACRITIC_FLOOR = 75;
