import { useEffect, useRef, useState } from 'react';
import { searchRawg } from '../services/rawgApi.js';
import type { Game } from '../types/index.js';
import { parseExpected } from '../utils/dateUtils.js';

export interface EnrichStatus {
  active: boolean;
  done: number;
  total: number;
}

const REQUEST_SPACING_MS = 60;

function targetYearOf(g: Game): number | null {
  if (g.year != null) return g.year;
  if (g.expectedDate) {
    const sk = parseExpected(g.expectedDate).sortKey;
    if (sk >= 10_000) return Math.floor(sk / 10_000);
  }
  return null;
}

// One-time RAWG backfill: walks any un-checked, non-rumored game in the
// snapshot at mount, fetches a match, and patches the result back via
// `applyPatch`. Pacing is polite (~60ms between calls) so we don't get
// rate-limited.
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
      let done = 0;
      for (const g of toEnrich) {
        if (cancelled) break;
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
        done++;
        setStatus({ active: true, done, total: toEnrich.length });
        await new Promise((r) => setTimeout(r, REQUEST_SPACING_MS));
      }
      setStatus({ active: false, done, total: toEnrich.length });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
