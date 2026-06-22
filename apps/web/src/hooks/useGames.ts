import { useCallback, useEffect, useRef, useState } from 'react';
import { loadGames, loadSeedGames, rerankTop50, saveGames } from '../services/libraryStorage.js';
import type { Completion, Game } from '../types/index.js';

export interface UseGamesResult {
  games: Game[];
  setGames: (games: Game[]) => void;
  addGame: (game: Game) => void;
  updateGame: (game: Game) => void;
  applyPatchToGame: (id: string, patch: Partial<Game>) => void;
  toggleCompletion: (id: string, key: keyof Completion) => void;
  deleteGame: (id: string) => void;
  reorderRumored: (id: string, direction: number) => void;
}

// Owns the games list + persistence. Re-ranks Top 50 after add/update/delete
// so the rank stays consistent with the score floor.
//
// Seed (~50kB gzip) is dynamic-imported only on a first boot where
// localStorage has nothing for us — every subsequent load skips the import
// entirely. The empty initial state flashes for one frame on that first
// boot; on every other visit the games array is populated synchronously.
export function useGames(): UseGamesResult {
  const [games, setGamesState] = useState<Game[]>(() => loadGames() ?? []);
  const seedNeeded = useRef(loadGames() === null);

  useEffect(() => {
    if (!seedNeeded.current) return;
    seedNeeded.current = false;
    void loadSeedGames().then((seed) => {
      // Don't clobber a library the user already built up in the gap
      // between mount and dynamic-import settling (RAWG enrichment can
      // patch state during this window).
      setGamesState((prev) => (prev.length === 0 ? seed : prev));
    });
  }, []);

  useEffect(() => {
    // Never persist `[]` — that would shadow the seed on a future boot
    // where the dynamic import races a quick reload. Once games is
    // non-empty (either seeded or user-built), every change persists.
    if (games.length === 0) return;
    saveGames(games);
  }, [games]);

  const setGames = useCallback((next: Game[]): void => {
    setGamesState(next);
  }, []);

  const addGame = useCallback((g: Game): void => {
    setGamesState((prev) => rerankTop50([...prev, g]));
  }, []);

  const updateGame = useCallback((g: Game): void => {
    setGamesState((prev) => rerankTop50(prev.map((x) => (x.id === g.id ? g : x))));
  }, []);

  const applyPatchToGame = useCallback((id: string, patch: Partial<Game>): void => {
    setGamesState((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);

  const toggleCompletion = useCallback((id: string, key: keyof Completion): void => {
    setGamesState((prev) =>
      prev.map((g) =>
        g.id === id
          ? {
              ...g,
              completion: {
                story: false,
                platinum: false,
                replayed: false,
                ...(g.completion ?? {}),
                [key]: !g.completion?.[key],
              },
            }
          : g,
      ),
    );
  }, []);

  const deleteGame = useCallback((id: string): void => {
    setGamesState((prev) => rerankTop50(prev.filter((x) => x.id !== id)));
  }, []);

  const reorderRumored = useCallback((id: string, direction: number): void => {
    setGamesState((prev) => {
      const idx = prev.findIndex((g) => g.id === id);
      if (idx < 0) return prev;
      let neighborIdx = idx + direction;
      while (
        neighborIdx >= 0 &&
        neighborIdx < prev.length &&
        prev[neighborIdx]?.state !== 'rumored'
      ) {
        neighborIdx += direction;
      }
      if (neighborIdx < 0 || neighborIdx >= prev.length) return prev;
      const next = [...prev];
      const a = next[idx];
      const b = next[neighborIdx];
      if (!a || !b) return prev;
      next[idx] = b;
      next[neighborIdx] = a;
      return next;
    });
  }, []);

  return {
    games,
    setGames,
    addGame,
    updateGame,
    applyPatchToGame,
    toggleCompletion,
    deleteGame,
    reorderRumored,
  };
}
