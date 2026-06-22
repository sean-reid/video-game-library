import { DISMISSED_KEY, NEWS_CACHE_KEY, READ_KEY, WORKER_BASE } from '../data/config.js';
import type { ArticleResponse, Game, Headline, NewsBundle, PodcastBundle } from '../types/index.js';

const NEWS_URL = `${WORKER_BASE}/news`;

export interface CachedNews extends NewsBundle {
  _cachedAt: number;
}

export async function fetchNews(forceFresh = false): Promise<CachedNews> {
  const url = forceFresh ? `${NEWS_URL}?nocache=1` : NEWS_URL;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
  const data = (await res.json()) as NewsBundle;
  return normaliseNewsPayload(data);
}

export async function fetchArticle(articleUrl: string): Promise<ArticleResponse> {
  const url = `${WORKER_BASE}/article?url=${encodeURIComponent(articleUrl)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
  return (await res.json()) as ArticleResponse;
}

// Each podcast show needs a cover gradient (the worker doesn't supply one) —
// look it up by show id and fall back to a neutral default.
const PODCAST_PRESENTATION: Record<string, { accent: string; coverGradient: string }> = {
  'kinda-funny-games-daily': {
    accent: '#e2b878',
    coverGradient: 'linear-gradient(135deg, #c2410c 0%, #7c2d12 100%)',
  },
  'kinda-funny-gamescast': {
    accent: '#a8b4c0',
    coverGradient: 'linear-gradient(135deg, #0c4a6e 0%, #1e293b 100%)',
  },
};

export function podcastPresentation(id: string): { accent: string; coverGradient: string } {
  return (
    PODCAST_PRESENTATION[id] ?? {
      accent: '#a1a1aa',
      coverGradient: 'linear-gradient(135deg, #27272a 0%, #18181b 100%)',
    }
  );
}

// Apply presentation gradients/accents to each podcast and stamp a local
// fetchedAt so we know how fresh the cached copy is.
export function normaliseNewsPayload(payload: NewsBundle): CachedNews {
  const podcasts: PodcastBundle[] = (payload.podcasts ?? []).map((p) => ({
    ...podcastPresentation(p.id),
    ...p,
  }));
  return { ...payload, podcasts, _cachedAt: Date.now() };
}

export function loadCachedNews(): CachedNews | null {
  try {
    const raw = localStorage.getItem(NEWS_CACHE_KEY);
    if (raw) return JSON.parse(raw) as CachedNews;
  } catch {
    /* corrupted entry — fall through to null */
  }
  return null;
}

export function saveCachedNews(data: CachedNews): void {
  try {
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* quota / disabled storage — drop silently */
  }
}

export function loadRead(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* corrupted entry */
  }
  return new Set();
}

export function saveRead(set: Set<string>): void {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...set]));
  } catch {
    /* quota */
  }
}

export function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function saveDismissed(set: Set<string>): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
  } catch {
    /* quota */
  }
}

function normalizeForMatch(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Does an article mention a game in the user's library? Returns the matched
// game, or null. Strips punctuation when comparing so "007: First Light"
// matches "007 First Light".
export function matchLibraryGame(article: Headline | null | undefined, games: Game[]): Game | null {
  if (!article || games.length === 0) return null;
  const haystack = normalizeForMatch(`${article.title} ${article.excerpt ?? ''}`);
  const sorted = [...games].sort((a, b) => b.title.length - a.title.length);
  for (const g of sorted) {
    if (!g.title) continue;
    const needle = normalizeForMatch(g.title);
    if (needle.length < 4) continue;
    if (haystack.includes(needle)) return g;
  }
  return null;
}
