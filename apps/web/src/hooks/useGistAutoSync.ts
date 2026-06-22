import { useEffect, useRef } from 'react';
import { updateGist } from '../services/gistApi.js';
import type { Game, UnlockedGistConfig } from '../types/index.js';

const DEBOUNCE_MS = 5000;

// Pushes the library to the configured Gist 5 seconds after the last change,
// but only when the vault is unlocked (token in memory). Skips the initial
// mount so we don't push immediately after hydrating from localStorage.
export function useGistAutoSync(
  games: Game[],
  unlocked: UnlockedGistConfig | null,
  onSynced: () => void,
): void {
  const skipFirst = useRef(true);

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return undefined;
    }
    if (!unlocked) return undefined;
    const timer = setTimeout(() => {
      void (async (): Promise<void> => {
        try {
          await updateGist(unlocked.token, unlocked.gistId, games);
          onSynced();
        } catch (e) {
          console.warn('Gist auto-sync failed:', e);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [games, unlocked, onSynced]);
}
