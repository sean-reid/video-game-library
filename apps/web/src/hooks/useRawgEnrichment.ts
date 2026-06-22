import { useEffect, useRef, useState } from 'react';
import { searchRawg } from '../services/rawgApi.js';
import type { Game } from '../types/index.js';
import { parseExpected } from '../utils/dateUtils.js';

export interface EnrichStatus {
  active: boolean;
  done: number;
  total: number;
}

// In-flight requests at any given time. The worker's RAWG proxy caches at
// the edge so we're not punching new traffic per match, but we still keep
// the pool small to be a polite client and avoid bursting through the
// upstream rate limit on a cold cache (e.g. on a fresh worker deploy).
const POOL_SIZE = 4;

function targetYearOf(g: Game): number | null {
  if (g.year != null) return g.year;
  if (g.expectedDate) {
    const sk = parseExpected(g.expectedDate).sortKey;
    if (sk >= 10_000) return Math.floor(sk / 10_000);
  }
  return null;
}

async function enrichOne(
  g: Game,
  applyPatch: (id: string, patch: Partial<Game>) => void,
): Promise<void> {
  try {
    const match = await searchRawg(g.title, targetYearOf(g));
    const patch: Partial<Game> = match
      ? {
          coverImage: match.background_image ?? null,
          rawgId: match.id,
          rawgReleased: match.released ?? null,
          rawgPlatforms: (match.platforms ?? [])
            .map((p) => p.platform?.name)
            .filter((n): n is string => Boolean(n)),
          rawgPlaytime: match.playtime ?? null,
          rawgGenres: (match.genres ?? [])
            .map((genre) => genre.slug)
            .filter((s): s is string => Boolean(s)),
          rawgMetacritic: match.metacritic ?? null,
          rawgChecked: true,
        }
      : { rawgChecked: true };
    applyPatch(g.id, patch);
  } catch (e) {
    console.warn('RAWG miss for', g.title, e);
  }
}

// One-time RAWG backfill: walks any un-checked, non-rumored game in the
// snapshot at mount, fetches a match, and patches the result back via
// `applyPatch`. Runs up to `POOL_SIZE` requests in parallel — on a fresh
// 150-game install this drops total wall-clock from ~9s of trickle to ~2-3s.
export function useRawgEnrichment(
  games: Game[],
  applyPatch: (id: string, patch: Partial<Game>) => void,
): EnrichStatus {
  const [status, setStatus] = useState<EnrichStatus>({ active: false, done: 0, total: 0 });
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return undefined;
    startedRef.current = true;

    let cancelled = false;
    const snapshot = games;
    const toEnrich = snapshot.filter((g) => !g.rawgChecked && g.state !== 'rumored');
    if (toEnrich.length === 0) return undefined;

    setStatus({ active: true, done: 0, total: toEnrich.length });

    void (async (): Promise<void> => {
      let cursor = 0;
      let done = 0;
      const worker = async (): Promise<void> => {
        while (!cancelled) {
          const idx = cursor++;
          if (idx >= toEnrich.length) return;
          const game = toEnrich[idx];
          if (!game) return;
          await enrichOne(game, applyPatch);
          if (cancelled) return;
          done++;
          setStatus({ active: true, done, total: toEnrich.length });
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(POOL_SIZE, toEnrich.length) }, () => worker()),
      );
      if (!cancelled) {
        setStatus({ active: false, done, total: toEnrich.length });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
