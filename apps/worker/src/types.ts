export type Platform = 'nintendo' | 'playstation' | 'xbox' | 'multi';
export type Category = 'review' | 'upcoming' | 'hardware' | 'company' | 'news';
export type EventType = 'nintendo' | 'playstation';

export interface RSSItem {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  publishedAt: string;
  coverImage: string | null;
}

export interface Headline extends RSSItem {
  source: string;
  platforms: Platform[];
  category: Category;
}

export interface AtomEntry {
  id: string;
  title: string;
  description: string;
  url: string;
  publishedAt: string;
}

export interface PodcastEpisode {
  title: string;
  date: string;
  duration: string;
  youtubeUrl: string;
  spotifyUrl: string;
  description: string;
}

export interface PodcastDebug {
  channelId: string;
  patterns?: string[];
  totalVideos?: number;
  matchedCount?: number;
  recentVideoTitles?: string[];
}

export interface PodcastBundle {
  id: string;
  show: string;
  accent: string;
  coverGradient: string;
  youtubeUrl: string;
  spotifyUrl: string;
  episodes: PodcastEpisode[];
  error?: string;
  _debug?: PodcastDebug;
}

export interface EventItem {
  id: string;
  type: EventType;
  title: string;
  date: string;
  time: string;
  accent: string;
  _source: 'wikipedia' | 'headlines';
  _from?: string;
  _matchedTitle?: string;
}

export interface NewsBundle {
  fetchedAt: string;
  headlines: Headline[];
  podcasts: PodcastBundle[];
  events: EventItem[];
}

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

export interface RSSSource {
  source: string;
  url: string;
  dedicated: boolean;
}

export interface PodcastSource {
  id: string;
  show: string;
  youtubeHandle: string;
  titlePatterns: string;
  accent: string;
  coverGradient: string;
  youtubeUrl: string;
  spotifyUrl: string;
}

export interface WikipediaEventSource {
  type: EventType;
  title: string;
  url: string;
  accent: string;
}
