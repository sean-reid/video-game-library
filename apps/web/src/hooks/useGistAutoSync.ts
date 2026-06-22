import { useEffect, useRef } from 'react';
import { saveGistConfig, updateGist } from '../services/gistApi.js';
import type { Game, GistSyncConfig } from '../types/index.js';

const DEBOUNCE_MS = 5000;

// Pushes the library to the configured Gist 5 seconds after the last change.
// Skips the initial mount so we don't push immediately after hydrating from
// localStorage.
export function useGistAutoSync(
  games: Game[],
  gistConfig: GistSyncConfig | null,
  setGistConfig: (config: GistSyncConfig | null) => void,
): void {
  const skipFirst = useRef(true);

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return undefined;
    }
    if (!gistConfig) return undefined;
    const timer = setTimeout(() => {
      void (async (): Promise<void> => {
        try {
          await updateGist(gistConfig.token, gistConfig.gistId, games);
          const next: GistSyncConfig = { ...gistConfig, lastSyncedAt: Date.now() };
          saveGistConfig(next);
          setGistConfig(next);
        } catch (e) {
          console.warn('Gist auto-sync failed:', e);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [games, gistConfig?.token, gistConfig?.gistId]);
}
