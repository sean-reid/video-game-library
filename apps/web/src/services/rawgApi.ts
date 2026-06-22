import { REC_METACRITIC_FLOOR, WORKER_BASE } from '../data/config.js';
import { PLATFORM_SHORT, RAWG_PLATFORM_IDS } from '../data/platforms.js';

// All RAWG traffic now goes through the worker's /rawg/* proxy. The
// historical RAWG_KEY in data/config.js stays for one more phase so a hot
// rollback (e.g. proxy outage) can flip back to direct calls without a code
// change; security-hardening removes it for good once the worker has shipped
// to prod for a release cycle.
const RAWG_PROXY_BASE = `${WORKER_BASE}/rawg`;

export const yearOf = (released: string | null | undefined): number | null => {
  if (!released) return null;
  const y = parseInt(String(released).slice(0, 4), 10);
  return isNaN(y) ? null : y;
};

// Rejects matches whose release year is >5 years off from the target year —
// this prevents unannounced sequels like "Star Fox 2026" from matching the
// 1993 SNES Star Fox.
const YEAR_MATCH_TOLERANCE = 5;

export interface RawgPlatformRef {
  platform?: { name?: string };
}

export interface RawgGenreRef {
  slug?: string;
}

export interface RawgSearchHit {
  id: number;
  slug?: string;
  name: string;
  released?: string | null;
  background_image?: string | null;
  platforms?: RawgPlatformRef[];
  genres?: RawgGenreRef[];
  metacritic?: number | null;
  playtime?: number | null;
}

interface RawgSearchResponse {
  results?: RawgSearchHit[];
}

interface RawgDetail extends RawgSearchHit {
  developers?: { slug?: string }[];
  publishers?: { slug?: string }[];
}

// Free-text search returning up to `pageSize` candidates (vs searchRawg
// which picks one best match). Used by the Add Game flow.
export async function searchRawgList(query: string, pageSize = 6): Promise<RawgSearchHit[]> {
  const q = encodeURIComponent(query);
  const url = `${RAWG_PROXY_BASE}/games?search=${q}&page_size=${String(pageSize)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RAWG ${String(res.status)}`);
  const data = (await res.json()) as RawgSearchResponse;
  return data.results ?? [];
}

export async function searchRawg(
  title: string,
  year?: number | null,
): Promise<RawgSearchHit | null> {
  const q = encodeURIComponent(title);
  const url = `${RAWG_PROXY_BASE}/games?search=${q}&page_size=5&search_precise=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RAWG ${String(res.status)}`);
  const data = (await res.json()) as RawgSearchResponse;
  if (!data.results?.length) return null;

  const results = [...data.results];
  if (year) {
    results.sort((a, b) => {
      const ay = yearOf(a.released);
      const by = yearOf(b.released);
      const ad = ay ? Math.abs(ay - year) : 999;
      const bd = by ? Math.abs(by - year) : 999;
      return ad - bd;
    });
    const best = results[0];
    if (!best) return null;
    const bestYear = yearOf(best.released);
    if (bestYear && Math.abs(bestYear - year) > YEAR_MATCH_TOLERANCE) {
      return null; // too far apart, almost certainly a different game
    }
  }
  return results[0] ?? null;
}

// Developers + publishers are NOT in the search response — we need this
// endpoint for them.
export async function fetchRawgDetail(rawgId: number): Promise<RawgDetail> {
  const res = await fetch(`${RAWG_PROXY_BASE}/games/${String(rawgId)}`);
  if (!res.ok) throw new Error(`RAWG detail ${String(res.status)}`);
  return (await res.json()) as RawgDetail;
}

export interface RecCandidate {
  rawgId: number;
  slug: string;
  title: string;
  year: number | null;
  released: string | null;
  coverImage: string | null;
  platforms: string[];
  genres: string[];
  metacritic: number | null;
  playtime: number | null;
  _score?: number;
}

// Normalise a RAWG game record into our compact candidate shape (kept slim
// because we cache it in localStorage).
export function candidateFromRawg(r: RawgSearchHit): RecCandidate {
  return {
    rawgId: r.id,
    slug: r.slug ?? '',
    title: r.name,
    year: yearOf(r.released),
    released: r.released ?? null,
    coverImage: r.background_image ?? null,
    platforms: (r.platforms ?? [])
      .map((p) => p.platform?.name)
      .filter((n): n is string => Boolean(n)),
    genres: (r.genres ?? []).map((g) => g.slug).filter((s): s is string => Boolean(s)),
    metacritic: r.metacritic ?? null,
    playtime: r.playtime ?? null,
  };
}

export interface TasteProfile {
  platformWeights: Record<string, number>;
  genreWeights: Record<string, number>;
  developerWeights: Record<string, number>;
  publisherWeights: Record<string, number>;
  topPlatforms: string[];
  topGenres: string[];
  topDevelopers: string[];
  topPublishers: string[];
}

export function scoreCandidate(c: RecCandidate, profile: TasteProfile): number {
  let s = (c.metacritic ?? 0) / 5; // Metacritic is the strongest single signal
  for (const p of c.platforms) {
    const sp = PLATFORM_SHORT[p as keyof typeof PLATFORM_SHORT] ?? p;
    if (profile.platformWeights[sp]) s += profile.platformWeights[sp] / 50;
  }
  for (const g of c.genres) {
    if (profile.genreWeights[g]) s += profile.genreWeights[g] / 50;
  }
  return s;
}

// Query RAWG with a few different filter sets and merge — gives variety
// rather than only Studio X's whole catalogue.
export async function fetchRecommendations(profile: TasteProfile): Promise<RecCandidate[]> {
  const platformIds = profile.topPlatforms
    .map((p) => RAWG_PLATFORM_IDS[p as keyof typeof RAWG_PLATFORM_IDS])
    .filter((id): id is number => Boolean(id))
    .join(',');
  const baseParams =
    `metacritic=${String(REC_METACRITIC_FLOOR)},100&page_size=20` +
    (platformIds ? `&platforms=${platformIds}` : '');

  const queries: string[] = [];
  if (profile.topDevelopers.length) {
    queries.push(
      `${RAWG_PROXY_BASE}/games?${baseParams}&developers=${profile.topDevelopers.join(',')}&ordering=-metacritic`,
    );
  }
  if (profile.topPublishers.length) {
    queries.push(
      `${RAWG_PROXY_BASE}/games?${baseParams}&publishers=${profile.topPublishers.join(',')}&ordering=-metacritic`,
    );
  }
  if (profile.topGenres.length) {
    queries.push(
      `${RAWG_PROXY_BASE}/games?${baseParams}&genres=${profile.topGenres.join(',')}&ordering=-rating`,
    );
  }
  if (queries.length === 0) return [];

  const buckets = await Promise.all(
    queries.map(async (url): Promise<RawgSearchHit[]> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = (await res.json()) as RawgSearchResponse;
        return data.results ?? [];
      } catch {
        return [];
      }
    }),
  );

  const seen = new Map<number, RawgSearchHit>();
  for (const r of buckets.flat()) {
    if (!seen.has(r.id)) seen.set(r.id, r);
  }
  const candidates = [...seen.values()].map(candidateFromRawg);
  for (const c of candidates) {
    c._score = scoreCandidate(c, profile);
  }
  candidates.sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
  return candidates.slice(0, 30);
}
