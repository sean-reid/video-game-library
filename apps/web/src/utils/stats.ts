import { CATEGORIES } from '../data/constants.js';
import { FRANCHISE_RULES } from '../data/franchises.js';
import type { Game, RatingCategory } from '../types/index.js';
import { effectiveCover, primaryPlatform, primaryYear } from './gameHelpers.js';

export type TierBand = 'Masterpiece' | 'Amazing' | 'Great' | 'Other';

export const TIER_BAND_ORDER: readonly TierBand[] = ['Masterpiece', 'Amazing', 'Great', 'Other'];

export type TierBands = Record<TierBand, number>;

function blankBands(): TierBands {
  return { Masterpiece: 0, Amazing: 0, Great: 0, Other: 0 };
}

// Match a game's title against the franchise table. Returns null for games
// that don't belong to a tracked franchise.
export function franchiseOf(game: Game): string | null {
  const t = game.title.trim();
  for (const r of FRANCHISE_RULES) if (r.match.test(t)) return r.label;
  return null;
}

// Bucket every played game into one of four bands:
//   Masterpiece (Top 50 + score ≥100), Amazing (Top 50 + 90-99),
//   Great (Top 50 + 80-89), Other (played but not in Top 50).
export function tierOfGame(g: Game): TierBand {
  if (g.topListRank == null) return 'Other';
  const t = g.rating?.total ?? 0;
  if (t >= 100) return 'Masterpiece';
  if (t >= 90) return 'Amazing';
  if (t >= 80) return 'Great';
  return 'Other';
}

export interface StackedTier {
  label: string;
  segments: TierBands;
  total: number;
}

export interface FranchiseRow {
  label: string;
  count: number;
  sumScore: number;
  ratedCount: number;
  masterpieces: number;
  games: Game[];
  recentGame?: Game | undefined;
  avgScore: number | null;
}

export interface ComputedStats {
  totalPlayed: number;
  totalRated: number;
  totalHours: number;
  byYearTiers: StackedTier[];
  byPlatformTiers: StackedTier[];
  topFranchises: FranchiseRow[];
  predictiveness: Record<RatingCategory, number>;
  masterpiecesCount: number;
  otherTop50Count: number;
  completion: { story: number; platinum: number; replayed: number };
}

export function computeStats(games: Game[]): ComputedStats {
  const played = games.filter((g) => g.state === 'played');
  const rated = played.filter((g) => g.rating?.total != null);
  const top50 = games.filter((g) => g.topListRank != null);

  // BY YEAR (2017 onward) — stacked tier counts
  const yearMap: Record<string, StackedTier> = {};
  for (const g of played) {
    const y = primaryYear(g);
    if (!y || y < 2017) continue;
    const key = String(y);
    yearMap[key] ??= { label: key, segments: blankBands(), total: 0 };
    yearMap[key].segments[tierOfGame(g)]++;
    yearMap[key].total++;
  }
  const byYearTiers = Object.values(yearMap).sort(
    (a, b) => parseInt(b.label, 10) - parseInt(a.label, 10),
  );

  // BY PLATFORM — same stacked-tier shape, sorted by total desc.
  const platformMap: Record<string, StackedTier> = {};
  for (const g of played) {
    const p = primaryPlatform(g);
    if (!p) continue;
    platformMap[p] ??= { label: p, segments: blankBands(), total: 0 };
    platformMap[p].segments[tierOfGame(g)]++;
    platformMap[p].total++;
  }
  const byPlatformTiers = Object.values(platformMap).sort((a, b) => b.total - a.total);

  // TOP FRANCHISES — group played games by franchise, surface counts + avg
  // score + masterpiece count. Thumbnail picks the highest-scored game with
  // a cover, falling back to the most-recent game.
  const franchiseMap: Record<string, FranchiseRow> = {};
  for (const g of played) {
    const f = franchiseOf(g);
    if (!f) continue;
    franchiseMap[f] ??= {
      label: f,
      count: 0,
      sumScore: 0,
      ratedCount: 0,
      masterpieces: 0,
      games: [],
      avgScore: null,
    };
    const row = franchiseMap[f];
    row.count++;
    row.games.push(g);
    if (g.rating?.total != null) {
      row.sumScore += g.rating.total;
      row.ratedCount++;
      if (g.rating.total >= 100) row.masterpieces++;
    }
  }
  for (const row of Object.values(franchiseMap)) {
    const withCover = row.games.filter((g) => effectiveCover(g));
    const pool = withCover.length > 0 ? withCover : row.games;
    pool.sort(
      (a, b) =>
        (b.rating?.total ?? 0) - (a.rating?.total ?? 0) ||
        (primaryYear(b) ?? 0) - (primaryYear(a) ?? 0),
    );
    row.recentGame = pool[0];
    row.avgScore = row.ratedCount > 0 ? row.sumScore / row.ratedCount : null;
  }
  // Single-game "franchises" aren't franchises.
  const topFranchises = Object.values(franchiseMap).filter((f) => f.count >= 2);

  // PREDICTIVENESS — for each rubric category, the lift in avg score among
  // Masterpieces vs. the rest of the Top 50. Positive = the category
  // distinguishes Masterpieces; ~0 = no signal; negative = anti-signal.
  const masterpieces = top50.filter((g) => (g.rating?.total ?? 0) >= 100);
  const otherTop50 = top50.filter((g) => (g.rating?.total ?? 0) < 100);
  const predictiveness = Object.fromEntries(
    CATEGORIES.map((c) => {
      if (masterpieces.length === 0 || otherTop50.length === 0) return [c.key, 0];
      const masterAvg =
        masterpieces.reduce((acc, g) => acc + (g.rating?.[c.key as RatingCategory] ?? 0), 0) /
        masterpieces.length;
      const otherAvg =
        otherTop50.reduce((acc, g) => acc + (g.rating?.[c.key as RatingCategory] ?? 0), 0) /
        otherTop50.length;
      return [c.key, masterAvg - otherAvg];
    }),
  ) as Record<RatingCategory, number>;

  // Completion stats (story / platinum / replayed).
  const completion = { story: 0, platinum: 0, replayed: 0 };
  for (const g of rated) {
    if (g.completion?.story) completion.story++;
    if (g.completion?.platinum) completion.platinum++;
    if (g.completion?.replayed) completion.replayed++;
  }

  const totalPlayed = played.length;
  const totalRated = rated.length;
  const totalHours = games
    .filter((g) => g.rawgPlaytime && (g.state === 'played' || g.state === 'playing'))
    .reduce((acc, g) => acc + (g.rawgPlaytime ?? 0), 0);

  return {
    totalPlayed,
    totalRated,
    totalHours,
    byYearTiers,
    byPlatformTiers,
    topFranchises,
    predictiveness,
    masterpiecesCount: masterpieces.length,
    otherTop50Count: otherTop50.length,
    completion,
  };
}
