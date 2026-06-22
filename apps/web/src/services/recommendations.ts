import { RECS_KEY } from '../data/config.js';
import type { Game } from '../types/index.js';
import { primaryPlatform } from '../utils/gameHelpers.js';
import { reportError } from '../utils/reportError.js';
import { fetchRawgDetail, type RecCandidate, type TasteProfile } from './rawgApi.js';

export interface RecsState {
  fetchedAt: number;
  candidates: RecCandidate[];
  dismissedIds: number[];
}

const EMPTY: RecsState = { fetchedAt: 0, candidates: [], dismissedIds: [] };

export function loadRecs(): RecsState {
  try {
    const raw = localStorage.getItem(RECS_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<RecsState>;
    return {
      fetchedAt: parsed.fetchedAt ?? 0,
      candidates: parsed.candidates ?? [],
      dismissedIds: parsed.dismissedIds ?? [],
    };
  } catch (e) {
    reportError('recommendations.loadRecs', e);
    return EMPTY;
  }
}

export function saveRecs(recs: RecsState): void {
  try {
    localStorage.setItem(RECS_KEY, JSON.stringify(recs));
  } catch (e) {
    reportError('recommendations.saveRecs', e);
  }
}

function topN(weights: Record<string, number>, n: number): string[] {
  return Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

export function buildTasteProfile(games: Game[]): TasteProfile {
  const platformWeights: Record<string, number> = {};
  const genreWeights: Record<string, number> = {};
  const developerWeights: Record<string, number> = {};
  const publisherWeights: Record<string, number> = {};

  for (const g of games) {
    const score = g.rating?.total ?? 0;
    const isTop50 = g.topListRank != null;
    const top50Bonus = isTop50 ? 50 : 0;
    const top50Edge = isTop50 ? 3 : 0;

    if ((g.state === 'played' || g.state === 'playing') && score > 0) {
      const plat = primaryPlatform(g);
      if (plat) platformWeights[plat] = (platformWeights[plat] ?? 0) + score;
    }

    if (score > 0 && Array.isArray(g.rawgGenres)) {
      for (const slug of g.rawgGenres) {
        genreWeights[slug] = (genreWeights[slug] ?? 0) + score + top50Bonus;
      }
    }

    if (Array.isArray(g.rawgDevelopers)) {
      for (const slug of g.rawgDevelopers) {
        developerWeights[slug] = (developerWeights[slug] ?? 0) + 1 + top50Edge;
      }
    }
    if (Array.isArray(g.rawgPublishers)) {
      for (const slug of g.rawgPublishers) {
        publisherWeights[slug] = (publisherWeights[slug] ?? 0) + 1 + top50Edge;
      }
    }
  }

  return {
    platformWeights,
    genreWeights,
    developerWeights,
    publisherWeights,
    topPlatforms: topN(platformWeights, 5),
    topGenres: topN(genreWeights, 4),
    topDevelopers: topN(developerWeights, 6),
    topPublishers: topN(publisherWeights, 6),
  };
}

export type ApplyPatchFn = (id: string, patch: Partial<Game>) => void;

// One-time backfill: Top 50 games need devs/publishers for the profile.
// Pulls /games/{id} detail per game and patches them in. Paces requests
// at ~80ms apart.
export async function enrichTop50Detail(games: Game[], applyPatch: ApplyPatchFn): Promise<number> {
  const targets = games.filter(
    (g) =>
      g.topListRank != null &&
      g.rawgId != null &&
      (!Array.isArray(g.rawgDevelopers) || !Array.isArray(g.rawgPublishers)),
  );
  for (const g of targets) {
    if (g.rawgId == null) continue;
    try {
      const detail = await fetchRawgDetail(g.rawgId);
      applyPatch(g.id, {
        rawgDevelopers: (detail.developers ?? [])
          .map((d) => d.slug)
          .filter((s): s is string => Boolean(s)),
        rawgPublishers: (detail.publishers ?? [])
          .map((p) => p.slug)
          .filter((s): s is string => Boolean(s)),
        rawgGenres: (detail.genres ?? [])
          .map((g2) => g2.slug)
          .filter((s): s is string => Boolean(s)),
        rawgMetacritic: detail.metacritic ?? null,
      });
    } catch (e) {
      reportError(`recommendations.enrich:${g.title}`, e);
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  return targets.length;
}
