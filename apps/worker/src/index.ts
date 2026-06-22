// =============================================================================
// VGL News Worker
// -----------------------------------------------------------------------------
// Aggregates RSS feeds, YouTube channel uploads, and Wikipedia event listings
// into a single JSON endpoint for the Video Game Library app.
// Caches at Cloudflare's edge for 30 minutes so most calls are instant.
//
// Endpoints:
//   GET /        — health check
//   GET /news    — { fetchedAt, headlines, podcasts, events }
//   GET /news?nocache=1 — force a fresh fetch (skip edge cache)
// =============================================================================

import type { Env } from './env';
import type {
  AtomEntry,
  Category,
  EventItem,
  EventType,
  Headline,
  NewsBundle,
  PodcastBundle,
  Platform,
} from './types';
import {
  CACHE_TTL_SECONDS,
  GAMING_SIGNALS_RE,
  HEADLINES_PER_SOURCE,
  HEADLINES_TOTAL,
  NON_GAMING_TITLE_RE,
  NSFW_KEYWORDS,
  PODCAST_EPISODES,
  PODCAST_SOURCES,
  RSS_SOURCES,
  VICE_KEEP,
  WIKIPEDIA_EVENT_SOURCES,
} from './config';
import { fetchText } from './utils/fetch';
import { corsHeaders, jsonResponse } from './utils/http';
import { parseArticle } from './parsers/article';
import { parseAtom, parseRSS } from './parsers/rss';
import {
  extractDateFromText,
  extractTimeFromText,
  extractWikipediaUpcoming,
  parseEventDate,
} from './parsers/event';

export type { Env };

// =============================================================================
// REQUEST ROUTER
// =============================================================================
export default {
  async fetch(request: Request, _env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === '/' || url.pathname === '') {
      return jsonResponse({ ok: true, app: 'VGL News Worker', version: '1.0.0' });
    }

    if (url.pathname === '/news') {
      const forceFresh = url.searchParams.has('nocache');
      return getNews(ctx, forceFresh);
    }

    // Fetch + extract the main content of an article so the app can render
    // it in-line (no link-out required). Edge-cached for a week — article
    // content doesn't change.
    if (url.pathname === '/article') {
      const articleUrl = url.searchParams.get('url');
      if (!articleUrl) {
        return jsonResponse({ error: 'Missing url parameter' });
      }
      return await getArticleCached(articleUrl, ctx);
    }

    // Diagnostic — shows headlines that contain Direct/State of Play, plus
    // whatever events we detected. Helpful to confirm whether a missing
    // event is a detection problem or a feed problem.
    if (url.pathname === '/debug') {
      const headlines = await fetchAllHeadlines();
      const sopHeadlines = headlines.filter((h) => /state of play/i.test(h.title));
      const ndHeadlines = headlines.filter((h) => /nintendo direct/i.test(h.title));
      const events = await fetchAllEvents(headlines);
      return jsonResponse({
        totalHeadlines: headlines.length,
        stateOfPlayMentions: sopHeadlines.map((h) => ({
          source: h.source,
          title: h.title,
          publishedAt: h.publishedAt,
          url: h.url,
        })),
        nintendoDirectMentions: ndHeadlines.map((h) => ({
          source: h.source,
          title: h.title,
          publishedAt: h.publishedAt,
          url: h.url,
        })),
        events,
      });
    }

    return new Response('Not found', { status: 404, headers: corsHeaders() });
  },
} satisfies ExportedHandler<Env>;

// =============================================================================
// CACHE LAYER
// =============================================================================
async function getNews(ctx: ExecutionContext, forceFresh: boolean): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.vgl/news-v1');

  if (!forceFresh) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const cachedAt = parseInt(hit.headers.get('X-Cached-At') ?? '0', 10);
      if (Date.now() - cachedAt < CACHE_TTL_SECONDS * 1000) return hit;
    }
  }

  const bundle = await buildNewsBundle();
  const response = jsonResponse(bundle);
  response.headers.set('X-Cached-At', String(Date.now()));
  response.headers.set('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}`);
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function buildNewsBundle(): Promise<NewsBundle> {
  // Headlines feed BOTH the headlines list AND the event detection (so we can
  // catch a State of Play announcement that Wikipedia hasn't logged yet).
  const [headlines, podcasts] = await Promise.all([fetchAllHeadlines(), fetchAllPodcasts()]);
  const events = await fetchAllEvents(headlines);
  return {
    fetchedAt: new Date().toISOString(),
    headlines,
    podcasts,
    events,
  };
}

// =============================================================================
// HEADLINES
// =============================================================================
async function fetchAllHeadlines(): Promise<Headline[]> {
  const results = await Promise.all(
    RSS_SOURCES.map(async (src): Promise<Headline[]> => {
      try {
        const xml = await fetchText(src.url);
        let items = parseRSS(xml);

        // Vice publishes everything under one feed — only keep gaming/tech URLs.
        if (src.source === 'Vice') {
          items = items.filter((it) => it.url && VICE_KEEP.test(it.url));
        }

        // Drop NSFW articles by title/excerpt keyword match.
        items = items.filter(
          (it) => !NSFW_KEYWORDS.test(it.title) && !NSFW_KEYWORDS.test(it.excerpt),
        );

        // Drop articles that are clearly NOT about video games (movies, TV
        // shows, comics, anime, music). Gaming signals override.
        items = items.filter((it) => {
          const haystack = `${it.title} ${it.excerpt}`;
          if (GAMING_SIGNALS_RE.test(haystack)) return true;
          return !NON_GAMING_TITLE_RE.test(it.title);
        });

        // Mixed-content sources: require an explicit gaming signal somewhere
        // in title/excerpt/URL. Drops Engadget's Apple/Google/Tesla coverage,
        // Polygon's movie/TV pieces, GamesRadar's entertainment posts, etc.
        if (!src.dedicated) {
          items = items.filter((it) =>
            GAMING_SIGNALS_RE.test(`${it.title} ${it.excerpt} ${it.url}`),
          );
        }

        items = items.slice(0, HEADLINES_PER_SOURCE);

        return (
          items
            .map(
              (it): Headline => ({
                ...it,
                source: src.source,
                platforms: inferPlatforms(it.title, src.source),
                category: inferCategory(it.title),
              }),
            )
            // Drop articles whose only platform is Xbox (user is PS + Switch).
            .filter((it) => !(it.platforms.length === 1 && it.platforms[0] === 'xbox'))
        );
      } catch {
        return [];
      }
    }),
  );
  const flat = results.flat();

  // Dedupe by URL — some articles cross-post across aggregators.
  const seen = new Set<string>();
  const unique = flat.filter((it) => {
    const key = (it.url || it.id || '').replace(/[#?].*$/, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return unique.slice(0, HEADLINES_TOTAL);
}

function inferPlatforms(title: string, source: string): Platform[] {
  const t = title.toLowerCase();
  const set = new Set<Platform>();
  if (source === 'Nintendo Life') set.add('nintendo');
  if (source === 'PlayStation Blog' || source === 'Push Square') set.add('playstation');
  if (/\b(switch 2|switch|nintendo|joy-?con|pokem|pokém)/.test(t)) set.add('nintendo');
  if (/\b(ps5|ps4|playstation|sony|dualsense)\b/.test(t)) set.add('playstation');
  if (/\b(xbox|microsoft|series x|series s)\b/.test(t)) set.add('xbox');
  if (set.size === 0) set.add('multi');
  return [...set];
}

function inferCategory(title: string): Category {
  const t = title.toLowerCase();
  if (/\breview\b|\b\d+\/10\b|\bverdict\b|hands-?on/.test(t)) return 'review';
  if (/\b(delay|launch|release date|reveal|trailer|coming|announce|unveil|preview)\b/.test(t))
    return 'upcoming';
  if (/\b(hardware|console|joy-?con|controller|patent|firmware|update|pro\b)/.test(t))
    return 'hardware';
  if (/\b(layoff|earnings|sales|million units|acqui|company|studio)\b/.test(t)) return 'company';
  return 'news';
}

// =============================================================================
// PODCASTS (YouTube channel RSS, filtered by keyword)
// =============================================================================
async function fetchAllPodcasts(): Promise<PodcastBundle[]> {
  // 1) Resolve each unique handle to a channel ID
  const handleToChannelId = new Map<string, string | null>();
  const uniqueHandles = [...new Set(PODCAST_SOURCES.map((p) => p.youtubeHandle).filter(Boolean))];
  await Promise.all(
    uniqueHandles.map(async (handle) => {
      try {
        handleToChannelId.set(handle, await resolveYouTubeChannelId(handle));
      } catch {
        // resolution failure leaves handle absent from the map
      }
    }),
  );

  // 2) Fetch each unique CHANNEL's RSS exactly once. Multiple shows that
  //    share a channel reuse the same fetch — avoids YouTube flakiness
  //    where two parallel requests to the same URL can return different
  //    statuses (one OK, one 404).
  interface ChannelData {
    videos?: AtomEntry[];
    error?: string;
  }
  const channelData = new Map<string, ChannelData>();
  const uniqueChannelIds = [
    ...new Set([...handleToChannelId.values()].filter((cid): cid is string => Boolean(cid))),
  ];
  await Promise.all(
    uniqueChannelIds.map(async (cid) => {
      try {
        const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`);
        channelData.set(cid, { videos: parseAtom(xml) });
      } catch (e) {
        channelData.set(cid, { error: String(e) });
      }
    }),
  );

  // 3) For each podcast, filter the shared video list by patterns. Match
  //    against TITLE ONLY (YouTube channel descriptions contain show-name
  //    boilerplate that would otherwise over-match).
  return PODCAST_SOURCES.map((pod): PodcastBundle => {
    const baseShape: PodcastBundle = {
      id: pod.id,
      show: pod.show,
      accent: pod.accent,
      coverGradient: pod.coverGradient,
      youtubeUrl: pod.youtubeUrl,
      spotifyUrl: pod.spotifyUrl,
      episodes: [],
    };
    const channelId = handleToChannelId.get(pod.youtubeHandle);
    if (!channelId) {
      baseShape.error = `Could not resolve channel ID for ${pod.youtubeHandle}`;
      return baseShape;
    }
    const data = channelData.get(channelId);
    if (!data || data.error) {
      baseShape.error = data?.error ?? 'No videos fetched';
      baseShape._debug = { channelId };
      return baseShape;
    }
    const videos = data.videos ?? [];

    const patterns = pod.titlePatterns
      .toLowerCase()
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    const matching = videos.filter((v) => {
      const title = v.title.toLowerCase();
      return patterns.some((p) => title.includes(p));
    });

    const primaryNeedle = patterns[0] ?? '';
    baseShape.episodes = matching.slice(0, PODCAST_EPISODES).map((v) => ({
      title: cleanEpisodeTitle(v.title, primaryNeedle),
      date: v.publishedAt.slice(0, 10),
      duration: '',
      youtubeUrl: v.url,
      spotifyUrl: pod.spotifyUrl,
      // Full video description so the client can parse chapter timestamps.
      // Capped to keep the JSON payload reasonable.
      description: v.description.slice(0, 4000),
    }));

    baseShape._debug = {
      channelId,
      patterns,
      totalVideos: videos.length,
      matchedCount: matching.length,
      recentVideoTitles: videos.slice(0, 10).map((v) => v.title),
    };
    return baseShape;
  });
}

// Fetch a YouTube channel page and extract its channelId from the embedded
// metadata. Works with @handle URLs which don't expose the ID in their path.
async function resolveYouTubeChannelId(handleOrUrl: string): Promise<string | null> {
  const url = handleOrUrl.startsWith('http')
    ? handleOrUrl
    : `https://www.youtube.com/${handleOrUrl.replace(/^\/+/, '')}`;
  const html = await fetchText(url);
  const candidates = [
    /"channelId":"(UC[\w-]{20,})"/,
    /"externalId":"(UC[\w-]{20,})"/,
    /<link\s+rel="canonical"\s+href="[^"]*\/channel\/(UC[\w-]{20,})"/,
    /\/channel\/(UC[\w-]{20,})/,
  ];
  for (const re of candidates) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

// "Kinda Funny Games Daily 05-29-26 — GTA VI date locked" → "GTA VI date locked"
function cleanEpisodeTitle(title: string, showName: string): string {
  let t = title;
  if (showName) {
    const idx = t.toLowerCase().indexOf(showName.toLowerCase());
    if (idx === 0) t = t.slice(showName.length).trim();
  }
  t = t.replace(/^\s*\d{1,2}[-./]\d{1,2}[-./]\d{2,4}\s*/, '').trim();
  t = t.replace(/^[—–\-:|]\s*/, '').trim();
  return t || title;
}

// =============================================================================
// EVENTS (Wikipedia scrape)
// =============================================================================
async function fetchAllEvents(headlines: Headline[]): Promise<EventItem[]> {
  // 1) Try Wikipedia (works once the page is updated, but they're slow).
  const wikiEvents = await Promise.all(
    WIKIPEDIA_EVENT_SOURCES.map(async (ev): Promise<EventItem | null> => {
      try {
        const html = await fetchText(ev.url);
        const upcoming = extractWikipediaUpcoming(html);
        if (!upcoming) return null;
        const parsedDate = parseEventDate(upcoming.date);
        const dateSlug = parsedDate
          ? parsedDate.toISOString().slice(0, 10)
          : upcoming.date
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '');
        return {
          id: `${ev.type}-${dateSlug}`,
          type: ev.type,
          title: ev.title,
          date: upcoming.date,
          time: upcoming.time,
          accent: ev.accent,
          _source: 'wikipedia',
        };
      } catch {
        return null;
      }
    }),
  );

  // 2) Scan recent headlines for event announcements — catches fresh news
  //    Wikipedia hasn't logged yet (announcements come hours/days before).
  const headlineEvents = extractEventsFromHeadlines(headlines);

  // 3) Merge + dedupe by type+date.
  return dedupeEvents([...wikiEvents.filter((e): e is EventItem => e !== null), ...headlineEvents]);
}

function dedupeEvents(events: EventItem[]): EventItem[] {
  const seen = new Map<string, EventItem>();
  for (const ev of events) {
    // Loose key — same type within a few days = same event
    const ts = parseEventDate(ev.date)?.getTime();
    const dayKey = ts !== undefined ? Math.floor(ts / 86400000) : ev.date;
    const key = `${ev.type}-${String(dayKey)}`;
    if (!seen.has(key)) seen.set(key, ev);
  }
  return [...seen.values()];
}

function extractEventsFromHeadlines(headlines: Headline[]): EventItem[] {
  const events: EventItem[] = [];
  for (const h of headlines) {
    const text = `${h.title} ${h.excerpt}`;
    const titleOnly = h.title;

    const isStateOfPlay = /state of play/i.test(text);
    // Exclude past-coverage headlines — check title only to avoid catching
    // an excerpt that mentions "highlights from previous shows" in a
    // forward-looking announcement.
    const isPastCoverage =
      /\b(recap|everything announced|highlights|round-?up|here's what|takeaways|reaction|aftermath|takeaway)\b/i.test(
        titleOnly,
      );
    const isNintendoDirect = /nintendo direct/i.test(text);

    if (!(isStateOfPlay || isNintendoDirect)) continue;
    if (isPastCoverage) continue;

    // Use the article's publish date as the year context: "June 2" in a
    // May 2026 article is overwhelmingly likely to mean June 2, 2026.
    const contextDate = h.publishedAt ? new Date(h.publishedAt) : new Date();
    const parsed = extractDateFromText(text, contextDate);
    if (!parsed) continue;

    const ts = parsed.getTime();
    const contextTs = contextDate.getTime();
    // Skip if the event is well before the article was written (probably a
    // reference to a past event) or far past the cache window.
    if (ts < contextTs - 7 * 86_400_000) continue;
    if (ts > contextTs + 120 * 86_400_000) continue;

    const type: EventType = isStateOfPlay ? 'playstation' : 'nintendo';
    const title = isStateOfPlay ? 'Sony State of Play' : 'Nintendo Direct';
    const accent = isStateOfPlay ? '#3b82f6' : '#dc2626';

    events.push({
      id: `${type}-${parsed.toISOString().slice(0, 10)}`,
      type,
      title,
      date: parsed.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      time: extractTimeFromText(text) ?? 'TBA',
      accent,
      _source: 'headlines',
      _from: h.source,
      _matchedTitle: h.title,
    });
  }
  return events;
}

// =============================================================================
// FULL ARTICLE FETCH + CONTENT EXTRACTION
// =============================================================================
async function getArticleCached(articleUrl: string, ctx: ExecutionContext): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request(
    `https://cache.vgl/article-v1?url=${encodeURIComponent(articleUrl)}`,
  );
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const html = await fetchText(articleUrl);
    const article = parseArticle(html, articleUrl);
    const response = jsonResponse(article);
    response.headers.set('Cache-Control', 'public, max-age=604800'); // 7 days
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (e) {
    return jsonResponse({ error: String(e), sourceUrl: articleUrl });
  }
}
