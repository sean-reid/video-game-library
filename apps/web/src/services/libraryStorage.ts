import { STORAGE_KEY } from '../data/config.js';
import { SEED_GAMES } from '../data/seed.js';
import type { Game } from '../types/index.js';

const TOP_LIST_FLOOR = 80;

export function loadGames(): Game[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Game[];
  } catch {
    /* corrupted entry */
  }
  return SEED_GAMES;
}

export function saveGames(games: Game[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  } catch {
    /* quota or disabled storage */
  }
}

// Re-rank the Top 50 after any change that could affect ordering.
// Games whose score drops below the floor lose their topListRank; the rest
// get sequential ranks 1, 2, 3, … sorted by score (ties broken by existing rank).
export function rerankTop50(games: Game[]): Game[] {
  const cleaned: Game[] = games.map((g) => {
    if (g.topListRank != null && (g.rating?.total ?? 0) < TOP_LIST_FLOOR) {
      const { topListRank: _drop, ...rest } = g;
      return rest;
    }
    return g;
  });
  const top50 = cleaned.filter((g) => g.topListRank != null);
  top50.sort((a, b) => {
    const scoreDiff = (b.rating?.total ?? 0) - (a.rating?.total ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (a.topListRank ?? 9999) - (b.topListRank ?? 9999);
  });
  const newRanks = new Map<string, number>();
  top50.forEach((g, i) => newRanks.set(g.id, i + 1));
  return cleaned.map((g) => {
    const rank = newRanks.get(g.id);
    return rank != null ? { ...g, topListRank: rank } : g;
  });
}
