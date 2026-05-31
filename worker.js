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

const CACHE_TTL_SECONDS = 30 * 60;       // 30 min
const PER_SOURCE_TIMEOUT_MS = 5000;
const HEADLINES_PER_SOURCE = 12;
const HEADLINES_TOTAL = 100;
const PODCAST_EPISODES = 8;

// -----------------------------------------------------------------------------
// SOURCES
// -----------------------------------------------------------------------------

const RSS_SOURCES = [
  { source: 'Nintendo Life',    url: 'https://www.nintendolife.com/feeds/news' },
  { source: 'PlayStation Blog', url: 'https://blog.playstation.com/feed/' },
  { source: 'Polygon',          url: 'https://www.polygon.com/rss/index.xml' },
  { source: 'IGN',              url: 'https://feeds.feedburner.com/ign/games-all' },
  { source: 'Engadget',         url: 'https://www.engadget.com/rss.xml' },
  { source: 'Push Square',      url: 'https://www.pushsquare.com/feeds/news' },
  { source: 'GamesRadar+',      url: 'https://www.gamesradar.com/all-articles/rss/' },
  { source: 'Vice',             url: 'https://www.vice.com/en/rss' },
];

// Podcasts — referenced by handle, the Worker resolves the channel ID itself
// by scraping the channel page once per cache window.
const PODCAST_SOURCES = [
  {
    id: 'kinda-funny-games-daily',
    show: 'Kinda Funny Games Daily',
    youtubeHandle: '@KindaFunnyGames',
    titleIncludes: 'Games Daily',
    accent: '#e2b878',
    coverGradient: 'linear-gradient(135deg, #c2410c 0%, #7c2d12 100%)',
    youtubeUrl: 'https://www.youtube.com/@KindaFunnyGames',
    spotifyUrl: 'https://open.spotify.com/show/3kgkr9aGYxYCwOFm7G44VL',
  },
  {
    id: 'kinda-funny-gamescast',
    show: 'Kinda Funny Gamescast',
    youtubeHandle: '@KindaFunnyGames',
    titleIncludes: 'Gamescast',
    accent: '#a8b4c0',
    coverGradient: 'linear-gradient(135deg, #0c4a6e 0%, #1e293b 100%)',
    youtubeUrl: 'https://www.youtube.com/@KindaFunnyGames',
    spotifyUrl: 'https://open.spotify.com/show/4XPl3uEEL9hvqMkoZrzbx5',
  },
];

// Drop articles that are clearly off-topic.
const NSFW_KEYWORDS = /\b(porn|nude|sex|erotic|onlyfans|hentai|nsfw|escort|prostitut|fetish|kink)\b/i;
// For Vice — only keep URL paths that are clearly gaming/tech.
const VICE_KEEP = /\/(games?|gaming|waypoint|tech|technology)(\/|$|-)/i;

const WIKIPEDIA_EVENT_SOURCES = [
  {
    type: 'nintendo',
    title: 'Nintendo Direct',
    url: 'https://en.wikipedia.org/wiki/List_of_Nintendo_Direct_presentations',
    accent: '#dc2626',
  },
  {
    type: 'playstation',
    title: 'Sony State of Play',
    url: 'https://en.wikipedia.org/wiki/State_of_Play_(PlayStation)',
    accent: '#3b82f6',
  },
];

// =============================================================================
// REQUEST ROUTER
// =============================================================================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === '/' || url.pathname === '') {
      return jsonResponse({ ok: true, app: 'VGL News Worker', version: '1.0.0' });
    }

    if (url.pathname === '/news') {
      const forceFresh = url.searchParams.has('nocache');
      return getNews(request, ctx, forceFresh);
    }

    return new Response('Not found', { status: 404, headers: corsHeaders() });
  },
};

// =============================================================================
// CACHE LAYER
// =============================================================================
async function getNews(request, ctx, forceFresh) {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.vgl/news-v1');

  if (!forceFresh) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const cachedAt = parseInt(hit.headers.get('X-Cached-At') || '0', 10);
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

async function buildNewsBundle() {
  const [headlines, podcasts, events] = await Promise.all([
    fetchAllHeadlines(),
    fetchAllPodcasts(),
    fetchAllEvents(),
  ]);
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
async function fetchAllHeadlines() {
  const results = await Promise.all(
    RSS_SOURCES.map(async (src) => {
      try {
        const xml = await fetchText(src.url);
        let items = parseRSS(xml);

        // Vice publishes everything under one feed — only keep gaming/tech URLs.
        if (src.source === 'Vice') {
          items = items.filter((it) => it.url && VICE_KEEP.test(it.url));
        }

        // Drop NSFW articles by title/excerpt keyword match.
        items = items.filter(
          (it) => !NSFW_KEYWORDS.test(it.title || '') && !NSFW_KEYWORDS.test(it.excerpt || '')
        );

        items = items.slice(0, HEADLINES_PER_SOURCE);

        return items
          .map((it) => ({
            ...it,
            source: src.source,
            platforms: inferPlatforms(it.title, src.source),
            category: inferCategory(it.title),
          }))
          // Drop articles whose only platform is Xbox (user is PS + Switch).
          .filter((it) => !(it.platforms.length === 1 && it.platforms[0] === 'xbox'));
      } catch (e) {
        return [];
      }
    })
  );
  const flat = results.flat();

  // Dedupe by URL — some articles cross-post across aggregators.
  const seen = new Set();
  const unique = flat.filter((it) => {
    const key = (it.url || it.id || '').replace(/[#?].*$/, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return unique.slice(0, HEADLINES_TOTAL);
}

function inferPlatforms(title, source) {
  const t = title.toLowerCase();
  const set = new Set();
  if (source === 'Nintendo Life') set.add('nintendo');
  if (source === 'PlayStation Blog' || source === 'Push Square') set.add('playstation');
  if (/\b(switch 2|switch|nintendo|joy-?con|pokem|pokém)/.test(t)) set.add('nintendo');
  if (/\b(ps5|ps4|playstation|sony|dualsense)\b/.test(t)) set.add('playstation');
  if (/\b(xbox|microsoft|series x|series s)\b/.test(t)) set.add('xbox');
  if (set.size === 0) set.add('multi');
  return [...set];
}

function inferCategory(title) {
  const t = title.toLowerCase();
  if (/\breview\b|\b\d+\/10\b|\bverdict\b|hands-?on/.test(t)) return 'review';
  if (/\b(delay|launch|release date|reveal|trailer|coming|announce|unveil|preview)\b/.test(t)) return 'upcoming';
  if (/\b(hardware|console|joy-?con|controller|patent|firmware|update|pro\b)/.test(t)) return 'hardware';
  if (/\b(layoff|earnings|sales|million units|acqui|company|studio)\b/.test(t)) return 'company';
  return 'news';
}

// =============================================================================
// PODCASTS (YouTube channel RSS, filtered by keyword)
// =============================================================================
async function fetchAllPodcasts() {
  // Resolve channel IDs once (multiple shows may share a handle).
  const handleToChannelId = new Map();
  const uniqueHandles = [...new Set(PODCAST_SOURCES.map((p) => p.youtubeHandle).filter(Boolean))];
  await Promise.all(
    uniqueHandles.map(async (handle) => {
      try {
        handleToChannelId.set(handle, await resolveYouTubeChannelId(handle));
      } catch {}
    })
  );

  return Promise.all(
    PODCAST_SOURCES.map(async (pod) => {
      const baseShape = {
        id: pod.id,
        show: pod.show,
        accent: pod.accent,
        coverGradient: pod.coverGradient,
        youtubeUrl: pod.youtubeUrl,
        spotifyUrl: pod.spotifyUrl,
        episodes: [],
      };
      try {
        const channelId = handleToChannelId.get(pod.youtubeHandle);
        if (!channelId) throw new Error(`Could not resolve channel ID for ${pod.youtubeHandle}`);
        const xml = await fetchText(
          `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
        );
        const videos = parseAtom(xml);
        const needle = pod.titleIncludes.toLowerCase();
        const matching = videos.filter((v) => v.title.toLowerCase().includes(needle));
        baseShape.episodes = matching.slice(0, PODCAST_EPISODES).map((v) => ({
          title: cleanEpisodeTitle(v.title, pod.titleIncludes),
          date: v.publishedAt.slice(0, 10),
          duration: '',
          youtubeUrl: v.url,
          spotifyUrl: pod.spotifyUrl,
        }));
        return baseShape;
      } catch (e) {
        baseShape.error = String(e);
        return baseShape;
      }
    })
  );
}

// Fetch a YouTube channel page and extract its channelId from the embedded
// metadata. Works with @handle URLs which don't expose the ID in their path.
async function resolveYouTubeChannelId(handleOrUrl) {
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
    if (m) return m[1];
  }
  return null;
}

// "Kinda Funny Games Daily 05-29-26 — GTA VI date locked" → "GTA VI date locked"
function cleanEpisodeTitle(title, showName) {
  let t = title;
  const idx = t.toLowerCase().indexOf(showName.toLowerCase());
  if (idx === 0) t = t.slice(showName.length).trim();
  t = t.replace(/^\s*\d{1,2}[-./]\d{1,2}[-./]\d{2,4}\s*/, '').trim();
  t = t.replace(/^[—–\-:|]\s*/, '').trim();
  return t || title;
}

// =============================================================================
// EVENTS (Wikipedia scrape)
// =============================================================================
async function fetchAllEvents() {
  const results = await Promise.all(
    WIKIPEDIA_EVENT_SOURCES.map(async (ev) => {
      try {
        const html = await fetchText(ev.url);
        const upcoming = extractWikipediaUpcoming(html);
        if (!upcoming) return null;
        return {
          id: `${ev.type}-${upcoming.date}`,
          type: ev.type,
          title: ev.title,
          date: upcoming.date,
          time: upcoming.time,
          accent: ev.accent,
        };
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

function extractWikipediaUpcoming(html) {
  // Walk every table row on the page. For each row, parse cells looking for
  // a future-dated cell + a time-of-day cell. Pick the soonest upcoming
  // event from anywhere in the page (handles "Upcoming" sections, main
  // tables with a future row, etc.).
  const now = Date.now();
  const candidates = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)) {
    const cells = [...rowMatch[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)]
      .map((m) => stripTags(m[1]).replace(/\[\d+\]/g, '').trim())
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
      if (!timeCell && /\d{1,2}[:.]\d{2}\s*(am|pm|a\.m\.|p\.m\.|et|pt|ct|mt|utc|gmt)/i.test(cell)) {
        timeCell = cell;
      }
    }
    if (dateCell && dateTs > now - 86_400_000) {
      candidates.push({ date: dateCell, time: timeCell || 'TBA', ts: dateTs });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.ts - b.ts);
  return { date: candidates[0].date, time: candidates[0].time };
}

function parseEventDate(s) {
  if (!s) return null;
  const cleaned = String(s).replace(/\[\d+\]/g, '').trim();

  // Try native Date parse first ("June 2, 2026", "2 June 2026", "2026-06-02")
  const native = new Date(cleaned);
  if (!isNaN(native.getTime()) && native.getFullYear() > 2000 && native.getFullYear() < 2100) {
    return native;
  }

  // "June 2, 2026" / "Jun 2 2026"
  const monthDayYear = cleaned.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (monthDayYear) {
    const months = { january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11 };
    const m = months[monthDayYear[1].toLowerCase()];
    if (m !== undefined) {
      return new Date(parseInt(monthDayYear[3], 10), m, parseInt(monthDayYear[2], 10));
    }
  }

  return null;
}

// =============================================================================
// RSS + ATOM PARSING
// =============================================================================
async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_SOURCE_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'VGL-News-Worker/1.0 (https://github.com/danrstaton/video-game-library)' },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`${url} returned ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseRSS(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const raw = m[1];
    const title = extractField(raw, 'title');
    const link = extractField(raw, 'link');
    const desc = extractField(raw, 'description') || extractField(raw, 'content:encoded');
    const pubDate = extractField(raw, 'pubDate') || extractField(raw, 'dc:date') || extractField(raw, 'published');
    const enc = raw.match(/<enclosure[^>]+url="([^"]+)"/);
    const media =
      raw.match(/<media:content[^>]+url="([^"]+)"/i) ||
      raw.match(/<media:thumbnail[^>]+url="([^"]+)"/i);
    const inlineImg = desc.match(/<img[^>]+src="([^"]+)"/i);
    items.push({
      id: link || title,
      title: cleanEntities(title),
      url: link,
      excerpt: truncate(stripTags(desc), 220),
      publishedAt: parseDate(pubDate),
      coverImage: enc?.[1] || media?.[1] || inlineImg?.[1] || null,
    });
  }
  return items;
}

function parseAtom(xml) {
  const items = [];
  for (const m of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)) {
    const raw = m[1];
    const title = extractField(raw, 'title');
    const linkMatch = raw.match(/<link[^>]+href="([^"]+)"/);
    const link = linkMatch?.[1] || '';
    const published = extractField(raw, 'published') || extractField(raw, 'updated');
    items.push({
      id: extractField(raw, 'yt:videoId') || link,
      title: cleanEntities(title),
      url: link,
      publishedAt: parseDate(published),
    });
  }
  return items;
}

function extractField(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function stripTags(s) {
  return cleanEntities(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function cleanEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + '…';
}

function parseDate(s) {
  if (!s) return new Date().toISOString();
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// =============================================================================
// HTTP HELPERS
// =============================================================================
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}
