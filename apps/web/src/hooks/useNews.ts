import { useEffect, useRef, useState } from 'react';
import { NEWS_STALE_MS } from '../data/config.js';
import { fetchNews, loadCachedNews, saveCachedNews, type CachedNews } from '../services/newsApi.js';

const REFRESH_ON_FOCUS_MS = 5 * 60 * 1000;

export interface UseNewsResult {
  news: CachedNews | null;
  loading: boolean;
  error: unknown;
  refresh: (forceFresh?: boolean) => void;
  lastFetched: number | null;
}

// Returns the live news bundle, with mount + visibility refetch and a
// "loading" flag that's true on first load OR when the cache is stale.
export function useNews(): UseNewsResult {
  const initialCache = loadCachedNews();
  const initialStale =
    !initialCache?._cachedAt || Date.now() - initialCache._cachedAt > NEWS_STALE_MS;
  const [news, setNews] = useState<CachedNews | null>(initialCache);
  const [loading, setLoading] = useState(!initialCache || initialStale);
  const [error, setError] = useState<unknown>(null);
  const [lastFetched, setLastFetched] = useState<number | null>(initialCache?._cachedAt ?? null);

  const refreshRef = useRef<(forceFresh?: boolean) => Promise<void>>(async () => {
    /* assigned below */
  });
  refreshRef.current = async (forceFresh = false): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const normalized = await fetchNews(forceFresh);
      setNews(normalized);
      setLastFetched(normalized._cachedAt);
      saveCachedNews(normalized);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshRef.current();
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      if (lastFetched && Date.now() - lastFetched > REFRESH_ON_FOCUS_MS) {
        void refreshRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return {
    news,
    loading,
    error,
    refresh: (force?: boolean) => {
      void refreshRef.current(force);
    },
    lastFetched,
  };
}
