// Shared types for the web app. Consumed by services, hooks, and (once
// extraction lands) components. The legacy bundle still ships as plain JSX
// for now; these types are the target shape that incremental TS migration
// converges on.

export type GameState = 'played' | 'playing' | 'upcoming' | 'rumored' | 'recommended';

export type RatingCategory =
  | 'narrative'
  | 'worldLevel'
  | 'gameplay'
  | 'art'
  | 'scoreAudio'
  | 'difficulty'
  | 'impact'
  | 'playTime'
  | 'emotional'
  | 'value';

export type TierLabel = 'Masterpiece' | 'Amazing' | 'Great' | 'Good' | 'Mixed';

export interface Rating extends Record<RatingCategory, number> {
  total: number;
}

export interface Completion {
  story?: boolean;
  platinum?: boolean;
  replayed?: boolean;
}

export interface Game {
  id: string;
  title: string;
  state: GameState;
  year?: number | null;
  platform?: string;
  topListRank?: number | null;
  rating?: Rating | null;
  completion?: Completion;
  notes?: string;
  coverImage?: string | null;
  // RAWG enrichment fields. rawgChecked goes true once we've made one
  // search attempt for the game, regardless of outcome.
  rawgChecked?: boolean;
  rawgId?: number | null;
  rawgReleased?: string | null;
  rawgPlatforms?: string[];
  rawgPlaytime?: number | null;
  rawgGenres?: string[];
  rawgDevelopers?: string[];
  rawgPublishers?: string[];
  rawgMetacritic?: number | null;
  // For rumored/upcoming games where the exact release isn't pinned down.
  expectedDate?: string;
  // User-entered HLTB-style estimate for "Recommended" cards (the legacy
  // form allows freeform hours alongside RAWG's number).
  timeToBeat?: number | string | null;
}

// News / podcast / event payloads returned by the Cloudflare worker.
// Kept in sync with apps/worker/src/types.ts by convention until we extract
// a shared package.
export type NewsPlatform = 'nintendo' | 'playstation' | 'xbox' | 'multi';
export type NewsCategory = 'review' | 'upcoming' | 'hardware' | 'company' | 'news';
export type EventType = 'nintendo' | 'playstation';

export interface Headline {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  publishedAt: string;
  coverImage: string | null;
  source: string;
  platforms: NewsPlatform[];
  category: NewsCategory;
}

export interface PodcastEpisode {
  title: string;
  date: string;
  duration: string;
  youtubeUrl: string;
  spotifyUrl?: string;
  description: string;
}

export interface PodcastBundle {
  id: string;
  show: string;
  accent: string;
  coverGradient: string;
  youtubeUrl: string;
  spotifyUrl?: string;
  episodes: PodcastEpisode[];
  error?: string;
}

export interface EventItem {
  id: string;
  type: EventType;
  title: string;
  date: string;
  time: string;
  accent: string;
}

export interface NewsBundle {
  fetchedAt: string;
  headlines: Headline[];
  podcasts: PodcastBundle[];
  events: EventItem[];
}

// Article payload returned by the worker's /article endpoint.
export interface ArticleResponse {
  title: string;
  byline: string | null;
  publishedAt: string | null;
  heroImage: string | null;
  siteName: string;
  description: string | null;
  content: string;
  sourceUrl: string;
}

// GitHub Gist sync state. Token lives in localStorage today; encrypted at
// rest in Phase 8.
export interface GistSyncConfig {
  token: string;
  gistId: string;
  gistUrl?: string;
  lastSyncedAt?: number;
}
