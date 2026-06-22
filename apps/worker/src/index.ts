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

export interface Env {
  RAWG_API_KEY: string;
  DEBUG?: string;
}

type Platform = 'nintendo' | 'playstation' | 'xbox' | 'multi';
type Category = 'review' | 'upcoming' | 'hardware' | 'company' | 'news';
type EventType = 'nintendo' | 'playstation';

interface RSSItem {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  publishedAt: string;
  coverImage: string | null;
}

interface Headline extends RSSItem {
  source: string;
  platforms: Platform[];
  category: Category;
}

interface AtomEntry {
  id: string;
  title: string;
  description: string;
  url: string;
  publishedAt: string;
}

interface PodcastEpisode {
  title: string;
  date: string;
  duration: string;
  youtubeUrl: string;
  spotifyUrl: string;
  description: string;
}

interface PodcastDebug {
  channelId: string;
  patterns?: string[];
  totalVideos?: number;
  matchedCount?: number;
  recentVideoTitles?: string[];
}

interface PodcastBundle {
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

interface EventItem {
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

interface NewsBundle {
  fetchedAt: string;
  headlines: Headline[];
  podcasts: PodcastBundle[];
  events: EventItem[];
}

interface ArticleResponse {
  title: string;
  byline: string | null;
  publishedAt: string | null;
  heroImage: string | null;
  siteName: string;
  description: string | null;
  content: string;
  sourceUrl: string;
}

const CACHE_TTL_SECONDS = 30 * 60; // 30 min
const PER_SOURCE_TIMEOUT_MS = 5000;
const HEADLINES_PER_SOURCE = 12;
const HEADLINES_TOTAL = 100;
const PODCAST_EPISODES = 8;

// -----------------------------------------------------------------------------
// SOURCES
// -----------------------------------------------------------------------------

// `dedicated: true` means the feed is gaming-only — we trust it.
// `dedicated: false` means we require a gaming keyword in the article before
// accepting it (Engadget covers all consumer tech, Polygon covers movies/TV,
// etc.)
interface RSSSource {
  source: string;
  url: string;
  dedicated: boolean;
}

const RSS_SOURCES: RSSSource[] = [
  { source: 'Nintendo Life', url: 'https://www.nintendolife.com/feeds/news', dedicated: true },
  { source: 'PlayStation Blog', url: 'https://blog.playstation.com/feed/', dedicated: true },
  { source: 'Polygon', url: 'https://www.polygon.com/rss/index.xml', dedicated: false },
  { source: 'IGN', url: 'https://feeds.feedburner.com/ign/games-all', dedicated: true },
  { source: 'Engadget', url: 'https://www.engadget.com/rss.xml', dedicated: false },
  { source: 'Push Square', url: 'https://www.pushsquare.com/feeds/news', dedicated: true },
  { source: 'GamesRadar+', url: 'https://www.gamesradar.com/all-articles/rss/', dedicated: false },
  { source: 'Vice', url: 'https://www.vice.com/en/rss', dedicated: false },
];

// Podcasts — referenced by handle, the Worker resolves the channel ID itself
// by scraping the channel page once per cache window.
// titlePatterns is a pipe-separated list of case-insensitive substrings;
// any one match against the video title OR description keeps the episode.
interface PodcastSource {
  id: string;
  show: string;
  youtubeHandle: string;
  titlePatterns: string;
  accent: string;
  coverGradient: string;
  youtubeUrl: string;
  spotifyUrl: string;
}

const PODCAST_SOURCES: PodcastSource[] = [
  {
    id: 'kinda-funny-games-daily',
    show: 'Kinda Funny Games Daily',
    youtubeHandle: '@KindaFunnyGames',
    titlePatterns: 'kinda funny games daily',
    accent: '#e2b878',
    coverGradient: 'linear-gradient(135deg, #c2410c 0%, #7c2d12 100%)',
    youtubeUrl: 'https://www.youtube.com/@KindaFunnyGames',
    spotifyUrl: 'https://open.spotify.com/show/3kgkr9aGYxYCwOFm7G44VL',
  },
  {
    id: 'kinda-funny-gamescast',
    show: 'Kinda Funny Gamescast',
    youtubeHandle: '@KindaFunnyGames',
    titlePatterns: 'kinda funny gamescast',
    accent: '#a8b4c0',
    coverGradient: 'linear-gradient(135deg, #0c4a6e 0%, #1e293b 100%)',
    youtubeUrl: 'https://www.youtube.com/@KindaFunnyGames',
    spotifyUrl: 'https://open.spotify.com/show/4XPl3uEEL9hvqMkoZrzbx5',
  },
];

// Drop articles that are clearly off-topic.
const NSFW_KEYWORDS =
  /\b(porn|nude|sex|erotic|onlyfans|hentai|nsfw|escort|prostitut|fetish|kink)\b/i;

// For Vice — only keep URL paths that are clearly gaming.
const VICE_KEEP = /\/(games?|gaming|waypoint)(\/|$|-)/i;

// Drop articles whose title makes them clearly NOT about video games.
// Two halves: general signals (movie, TV, comic, etc.) and specific
// franchise names that are *only* TV/film (no game equivalent we care about).
const NON_GAMING_TITLE_RE =
  /\b(movie|film(?!s?\s+(festival|score))|tv\s+show|tv\s+series|television series|series\s+(finale|premiere|renewed|cancell)|season\s+(finale|premiere|\d)|miniseries|streaming\s+series|netflix\s+(series|show|original)|hbo\s+(max\s+)?(series|show)|disney\+\s+(series|show)|apple\s+tv\+\s+(series|show)|prime\s+video\s+(series|show)|comic\s+book(?!\s+game)|graphic\s+novel|manga(?!\s+(game|adaptation))|anime\s+(series|season|episode)|album\s+release|world\s+tour|music\s+video|talk\s+show|late\s+night|wrestlemania|super\s+bowl|olympics|game\s+of\s+thrones|house\s+of\s+the\s+dragon|stranger\s+things|squid\s+game(?!\s+(unleashed|mobile))|wednesday(?:\s+(season|episode|series|netflix))?|emilia\s+clarke|daenerys|jon\s+snow|the\s+witcher\s+(season|episode|netflix\s+series)|breaking\s+bad|better\s+call\s+saul|wandavision|loki\s+season|euphoria)\b/i;

// Articles whose title/excerpt strongly signals gaming. Used both as an
// override for the non-gaming filter (e.g. "Movie tie-in game launched")
// AND as the gating signal for mixed-content sources (Engadget, Polygon,
// Vice, GamesRadar+) — those sources need a gaming keyword for an article
// to be kept at all.
const GAMING_SIGNALS_RE =
  /\b(?:video\s*games?|gameplay|gamer|gaming|playstation|ps[1-9]\b|xbox|nintendo|switch\s*2?\b|steam\s*deck|steam\b|game\s*pass|dlc|expansion\s+(?:pack|game)|console\b|esports?|speedrun|emulat|controller|gamepad|joy[- ]?con|dualsense|game\s+(?:launch|reveal|release|review|trailer|preview|update|patch|delay|announced|drops?|hits?|coming|of\s+the\s+year)|launch\s+title|exclusive\s+(?:game|title)|RPG\b|FPS\b|MMO\b|battle\s+royale|metroidvania|roguelike|soulslike|Pokémon|Pokemon|Mario|Zelda|Sonic|Final\s+Fantasy|Grand\s+Theft\s+Auto|GTA\s*VI?|Call\s+of\s+Duty|Hogwarts\s+Legacy|Spider-?Man\s+2?|Last\s+of\s+Us|God\s+of\s+War|Ghost\s+of\s+(?:Tsushima|Yotei|Yōtei)|Metroid|Splatoon|Halo|Forza|Hollow\s+Knight|Silksong|Marvel'?s\s+\w+|Star\s+Wars\s+(?:Jedi|Outlaws|Galactic)|Tomb\s+Raider|Clair\s+Obscur|Death\s+Stranding|Mixtape|Pokopia|Activision|Ubisoft|Bethesda|Capcom|Konami|Sega|Square\s+Enix|Bandai\s+Namco|FromSoftware|Insomniac|Naughty\s+Dog|Game\s+Freak|Bungie|Riot\s+Games|Valve\b|Epic\s+Games|Annapurna|Rockstar|Sony\s+Interactive)\b/i;

interface WikipediaEventSource {
  type: EventType;
  title: string;
  url: string;
  accent: string;
}

const WIKIPEDIA_EVENT_SOURCES: WikipediaEventSource[] = [
  {
    type: 'nintendo',
    title: 'Nintendo Direct',
    url: 'https://en.wikipedia.org/wiki/Nintendo_Direct',
    accent: '#dc2626',
  },
  {
    type: 'playstation',
    title: 'Sony State of Play',
    url: 'https://en.wikipedia.org/wiki/State_of_Play_(video_program)',
    accent: '#3b82f6',
  },
];

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

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function extractDateFromText(text: string, contextDate: Date): Date | null {
  const monthRe =
    '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)';
  // "June 2, 2026", "Jun 2 2026", "June 2nd", "2nd of June"
  let m = new RegExp(`\\b${monthRe}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, 'i').exec(
    text,
  );
  m ??= new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${monthRe}(?:,?\\s*(\\d{4}))?\\b`,
    'i',
  ).exec(text);
  if (!m?.[1] || !m[2]) return null;

  let monthName: string;
  let day: number;
  let year: number | null;
  if (MONTHS[m[1].toLowerCase()] !== undefined) {
    monthName = m[1];
    day = parseInt(m[2], 10);
    year = m[3] ? parseInt(m[3], 10) : null;
  } else {
    day = parseInt(m[1], 10);
    monthName = m[2];
    year = m[3] ? parseInt(m[3], 10) : null;
  }
  const month = MONTHS[monthName.toLowerCase()];
  if (month === undefined || !day) return null;

  if (!year) {
    // Anchor to the article's publish date when available — "June 2" in an
    // article published May 20, 2026 almost certainly means June 2, 2026,
    // even if the Worker's wall clock is in a different year.
    const anchorYear = contextDate.getFullYear();
    const candidate = new Date(anchorYear, month, day);
    // If the candidate is well before the anchor, the event is next year.
    year =
      candidate.getTime() < contextDate.getTime() - 30 * 86_400_000 ? anchorYear + 1 : anchorYear;
  }

  return new Date(year, month, day);
}

function extractTimeFromText(text: string): string | null {
  return extractTimeFromCell(text) || null;
}

function extractWikipediaUpcoming(html: string): { date: string; time: string } | null {
  const now = Date.now();
  const candidates: { date: string; time: string; ts: number }[] = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)) {
    const cells = [...rowMatch[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)]
      .map((m) =>
        stripTags(m[1] ?? '')
          .replace(/\[\d+\]/g, '')
          .trim(),
      )
      .filter(Boolean);
    if (cells.length === 0) continue;

    let dateCell = '';
    let dateTs = 0;
    let timeCell = '';
    for (const cell of cells) {
      if (!dateCell) {
        const parsed = parseEventDate(cell);
        if (parsed && parsed.getTime() > now - 86_400_000) {
          dateCell = cell;
          dateTs = parsed.getTime();
        }
      }
      if (!timeCell) {
        const t = extractTimeFromCell(cell);
        if (t) timeCell = t;
      }
    }
    if (dateCell && dateTs > now - 86_400_000) {
      candidates.push({ date: dateCell, time: timeCell || 'TBA', ts: dateTs });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.ts - b.ts);
  const first = candidates[0];
  if (!first) return null;
  return { date: first.date, time: first.time };
}

// Permissive time extractor — handles "5:00 PM EDT", "17:00 UTC",
// "5 p.m.", "2 PM Pacific". Returns the full matched substring.
function extractTimeFromCell(cell: string): string {
  // 1) HH:MM with optional am/pm and timezone — e.g. "5:00 PM EDT", "17:00 UTC"
  let m =
    /\b(\d{1,2}):(\d{2})\s*(?:(am|pm|a\.m\.|p\.m\.)\s*)?(?:\(?\s*(UTC|GMT|EST|EDT|PST|PDT|CST|CDT|MST|MDT|ET|PT|CT|MT|JST|CET|Pacific|Eastern|Central|Mountain)\s*\)?)?/i.exec(
      cell,
    );
  if (m) return m[0].trim();
  // 2) Hour with am/pm (no minutes) — e.g. "2 PM Pacific"
  m =
    /\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)\s*(?:\(?\s*(UTC|GMT|EST|EDT|PST|PDT|CST|CDT|MST|MDT|ET|PT|CT|MT|JST|CET|Pacific|Eastern|Central|Mountain)\s*\)?)?/i.exec(
      cell,
    );
  if (m) return m[0].trim();
  return '';
}

function parseEventDate(s: string): Date | null {
  if (!s) return null;
  const cleaned = String(s)
    .replace(/\[\d+\]/g, '')
    .trim();

  // Try native Date parse first ("June 2, 2026", "2 June 2026", "2026-06-02")
  const native = new Date(cleaned);
  if (!isNaN(native.getTime()) && native.getFullYear() > 2000 && native.getFullYear() < 2100) {
    return native;
  }

  // "June 2, 2026" / "Jun 2 2026"
  const monthDayYear =
    /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2}),?\s+(\d{4})/i.exec(
      cleaned,
    );
  if (monthDayYear?.[1] && monthDayYear[2] && monthDayYear[3]) {
    const m = MONTHS[monthDayYear[1].toLowerCase()];
    if (m !== undefined) {
      return new Date(parseInt(monthDayYear[3], 10), m, parseInt(monthDayYear[2], 10));
    }
  }

  return null;
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

function parseArticle(html: string, sourceUrl: string): ArticleResponse {
  // `||` rather than `??` is deliberate: an empty-string og:title should
  // still fall through to the <title> tag.
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const title = extractMeta(html, 'og:title') || extractField(html, 'title');
  const byline = extractMeta(html, 'article:author') ?? extractMeta(html, 'author');
  const publishedAt = extractMeta(html, 'article:published_time') ?? extractMeta(html, 'pubdate');
  const heroImage = extractMeta(html, 'og:image') ?? extractMeta(html, 'twitter:image');
  const siteName = extractMeta(html, 'og:site_name');
  const description = extractMeta(html, 'og:description') ?? extractMeta(html, 'description');

  const content = extractArticleContent(html);

  return {
    title: cleanEntities(title),
    byline: byline ? cleanEntities(byline) : null,
    publishedAt: publishedAt ?? null,
    heroImage: heroImage ?? null,
    siteName: siteName ? cleanEntities(siteName) : new URL(sourceUrl).hostname,
    description: description ? cleanEntities(description) : null,
    content,
    sourceUrl,
  };
}

function extractMeta(html: string, name: string): string | null {
  const escName = name.replace(/[:.]/g, '\\$&');
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escName}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escName}["']`,
    'i',
  );
  const m = html.match(re1) ?? html.match(re2);
  return m?.[1] ?? null;
}

function extractArticleContent(html: string): string {
  // Try common content containers in order — first match wins.
  const patterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]+class=["'][^"']*(?:c-entry-content|article-content|article__content|article-body|post-content|entry-content|story-content|content-body|article__main|m-detail--body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<section[^>]+class=["'][^"']*(?:article|story)[^"']*["'][^>]*>([\s\S]*?)<\/section>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ];

  let raw: string | null = null;
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      raw = m[1];
      break;
    }
  }
  if (!raw) return '';
  return cleanArticleHtml(raw);
}

function cleanArticleHtml(html: string): string {
  let s = html;
  // Strip executable / dangerous content
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, '');
  // Strip chrome
  s = s.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  s = s.replace(/<aside[\s\S]*?<\/aside>/gi, '');
  s = s.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  s = s.replace(/<header[\s\S]*?<\/header>/gi, '');
  s = s.replace(/<form[\s\S]*?<\/form>/gi, '');
  // Strip ads / share / related panels by class hint
  s = s.replace(
    /<(div|section|aside)[^>]+class=["'][^"']*(?:ad-|advertisement|share|social|newsletter|related|recommended|sidebar|promo|sponsor|subscribe|signup|comment|disqus|nielsen|connatix)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
    '',
  );
  // Strip iframes except YouTube / Vimeo embeds
  s = s.replace(
    /<iframe[^>]+src=["'](?!https?:\/\/(?:www\.)?(?:youtube|vimeo)\.com)[^"']*["'][^>]*>[\s\S]*?<\/iframe>/gi,
    '',
  );
  // Strip event handlers, tracking attrs, inline styles, classes, IDs
  s = s.replace(/\son\w+=["'][^"']*["']/g, '');
  s = s.replace(/\sdata-[\w-]+=["'][^"']*["']/g, '');
  s = s.replace(/\sstyle=["'][^"']*["']/g, '');
  s = s.replace(/\sclass=["'][^"']*["']/g, '');
  s = s.replace(/\sid=["'][^"']*["']/g, '');
  // Force img src to use https and lazy load
  s = s.replace(/<img\b/gi, '<img loading="lazy"');
  // Collapse whitespace
  s = s.replace(/[ \t\n]+/g, ' ').replace(/>\s+</g, '><');
  return s.trim();
}

// =============================================================================
// RSS + ATOM PARSING
// =============================================================================
async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_SOURCE_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'VGL-News-Worker/1.0 (https://github.com/danrstaton/video-game-library)',
      },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`${url} returned ${String(r.status)}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const raw = m[1] ?? '';
    const title = extractField(raw, 'title');
    const link = extractField(raw, 'link');
    const desc = extractField(raw, 'description') || extractField(raw, 'content:encoded');
    const pubDate =
      extractField(raw, 'pubDate') ||
      extractField(raw, 'dc:date') ||
      extractField(raw, 'published');
    const enc = /<enclosure[^>]+url="([^"]+)"/.exec(raw);
    const media =
      /<media:content[^>]+url="([^"]+)"/i.exec(raw) ??
      /<media:thumbnail[^>]+url="([^"]+)"/i.exec(raw);
    const inlineImg = /<img[^>]+src="([^"]+)"/i.exec(desc);
    items.push({
      id: link || title,
      title: cleanEntities(title),
      url: link,
      excerpt: truncate(stripTags(desc), 220),
      publishedAt: parseDate(pubDate),
      coverImage: enc?.[1] ?? media?.[1] ?? inlineImg?.[1] ?? null,
    });
  }
  return items;
}

function parseAtom(xml: string): AtomEntry[] {
  const items: AtomEntry[] = [];
  for (const m of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)) {
    const raw = m[1] ?? '';
    const title = extractField(raw, 'title');
    const linkMatch = /<link[^>]+href="([^"]+)"/.exec(raw);
    const link = linkMatch?.[1] ?? '';
    const published = extractField(raw, 'published') || extractField(raw, 'updated');
    // YouTube includes the video description inside <media:description>
    const description = extractField(raw, 'media:description');
    items.push({
      id: extractField(raw, 'yt:videoId') || link,
      title: cleanEntities(title),
      description: description ? cleanEntities(description) : '',
      url: link,
      publishedAt: parseDate(published),
    });
  }
  return items;
}

function extractField(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  if (!m?.[1]) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function stripTags(s: string): string {
  return cleanEntities(s)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanEntities(s: string): string {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)));
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + '…';
}

function parseDate(s: string): string {
  if (!s) return new Date().toISOString();
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// =============================================================================
// HTTP HELPERS
// =============================================================================
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}
