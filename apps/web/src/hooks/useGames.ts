import { useCallback, useEffect, useState } from 'react';
import { loadGames, rerankTop50, saveGames } from '../services/libraryStorage.js';
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
export function useGames(): UseGamesResult {
  const [games, setGamesState] = useState<Game[]>(loadGames);

  useEffect(() => {
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
