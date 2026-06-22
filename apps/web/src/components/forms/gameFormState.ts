import { CATEGORIES } from '../../data/constants.js';
import type { RawgSearchHit } from '../../services/rawgApi.js';
import { yearOf } from '../../services/rawgApi.js';
import type { Completion, Game, Rating } from '../../types/index.js';

// In-flight form shape — narrows the persisted Game with form-friendly
// strings for fields that the user types as text (year, topListRank,
// timeToBeat). formToGame normalises them back into Game on save.
export interface GameFormState {
  title: string;
  state: Game['state'];
  year: string;
  platform: string;
  topListRank: string;
  expectedDate: string;
  timeToBeat: string;
  notes: string;
  rating: Rating | null;
  completion: Completion;
  coverImage: string;
  rawgId: number | null;
  rawgReleased: string;
  rawgPlatforms: string[];
  rawgPlaytime: number | null;
  rawgChecked: boolean;
}

export function blankRating(): Rating {
  return {
    total: 0,
    narrative: 0,
    worldLevel: 0,
    gameplay: 0,
    art: 0,
    scoreAudio: 0,
    difficulty: 0,
    impact: 0,
    playTime: 0,
    emotional: 0,
    value: 0,
  };
}

export function ratingTotal(r: Rating): number {
  return CATEGORIES.reduce((s, c) => s + (r[c.key] || 0), 0);
}

export function blankForm(): GameFormState {
  return {
    title: '',
    state: 'recommended',
    year: '',
    platform: '',
    topListRank: '',
    expectedDate: '',
    timeToBeat: '',
    notes: '',
    rating: null,
    completion: { story: false, platinum: false, replayed: false },
    coverImage: '',
    rawgId: null,
    rawgReleased: '',
    rawgPlatforms: [],
    rawgPlaytime: null,
    rawgChecked: false,
  };
}

export function formFromGame(g: Game): GameFormState {
  return {
    ...blankForm(),
    title: g.title,
    state: g.state,
    year: g.year != null ? String(g.year) : '',
    platform: g.platform ?? '',
    topListRank: g.topListRank != null ? String(g.topListRank) : '',
    expectedDate: g.expectedDate ?? '',
    timeToBeat: g.timeToBeat != null ? String(g.timeToBeat) : '',
    notes: g.notes ?? '',
    rating: g.rating ?? null,
    completion: g.completion ?? { story: false, platinum: false, replayed: false },
    coverImage: g.coverImage ?? '',
    rawgId: g.rawgId ?? null,
    rawgReleased: g.rawgReleased ?? '',
    rawgPlatforms: g.rawgPlatforms ?? [],
    rawgPlaytime: g.rawgPlaytime ?? null,
    rawgChecked: g.rawgChecked ?? false,
  };
}

export function formFromRawg(r: RawgSearchHit): GameFormState {
  return {
    ...blankForm(),
    title: r.name,
    year: String(yearOf(r.released) ?? ''),
    coverImage: r.background_image ?? '',
    rawgId: r.id,
    rawgReleased: r.released ?? '',
    rawgPlatforms: (r.platforms ?? [])
      .map((p): string | undefined => p.platform?.name)
      .filter((n): n is string => Boolean(n)),
    rawgPlaytime: r.playtime ?? null,
    rawgChecked: true,
  };
}

export function formToGame(f: GameFormState, existingId?: string): Game {
  const id = existingId ?? (f.rawgId ? `rawg-${String(f.rawgId)}` : `manual-${String(Date.now())}`);
  const g: Game = {
    id,
    title: f.title,
    state: f.state,
    notes: f.notes,
    coverImage: f.coverImage || null,
    rawgId: f.rawgId,
    rawgReleased: f.rawgReleased || null,
    rawgPlatforms: f.rawgPlatforms,
    rawgPlaytime: f.rawgPlaytime,
    rawgChecked: f.rawgChecked,
  };
  if (f.year) g.year = parseInt(f.year, 10);
  if (f.platform) g.platform = f.platform;
  if (f.state === 'upcoming' && f.expectedDate) g.expectedDate = f.expectedDate;
  if (f.state === 'recommended' && f.timeToBeat) g.timeToBeat = String(f.timeToBeat);
  if (f.state === 'played') {
    if (f.rating && ratingTotal(f.rating) > 0) {
      g.rating = { ...f.rating, total: ratingTotal(f.rating) };
    }
    if (f.topListRank) g.topListRank = parseInt(f.topListRank, 10);
    g.completion = f.completion;
  }
  return g;
}
