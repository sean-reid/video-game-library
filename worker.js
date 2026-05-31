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

// Channel IDs (verify at youtube.com/<channel> → View Page Source → search "channelId").
// If a channel ID changes, the Worker just returns empty episodes for that show.
const PODCAST_SOURCES = [
  {
    id: 'kinda-funny-games-daily',
    show: 'Kinda Funny Games Daily',
    youtubeChannelId: 'UCagARFKzU7CK6w-D0RYRtsA', // @KindaFunnyGames
    titleIncludes: 'Games Daily',
    accent: '#e2b878',
    coverGradient: 'linear-gradient(135deg, #c2410c 0%, #7c2d12 100%)',
    youtubeUrl: 'https://www.youtube.com/@KindaFunnyGames',
    spotifyUrl: 'https://open.spotify.com/show/3kgkr9aGYxYCwOFm7G44VL',
  },
  {
    id: 'kinda-funny-gamescast',
    show: 'Kinda Funny Gamescast',
    youtubeChannelId: 'UCagARFKzU7CK6w-D0RYRtsA', // @KindaFunnyGames
    titleIncludes: 'Gamescast',
    accent: '#a8b4c0',
    coverGradient: 'linear-gradient(135deg, #0c4a6e 0%, #1e293b 100%)',
    youtubeUrl: 'https://www.youtube.com/@KindaFunnyGames',
    spotifyUrl: 'https://open.spotify.com/show/4XPl3uEEL9hvqMkoZrzbx5',
  },
];

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
        const items = parseRSS(xml).slice(0, HEADLINES_PER_SOURCE);
        return items.map((it) => ({
          ...it,
          source: src.source,
          platforms: inferPlatforms(it.title, src.source),
          category: inferCategory(it.title),
        }));
      } catch (e) {
        return [];
      }
    })
  );
  const flat = results.flat();
  flat.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return flat.slice(0, HEADLINES_TOTAL);
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
        const xml = await fetchText(
          `https://www.youtube.com/feeds/videos.xml?channel_id=${pod.youtubeChannelId}`
        );
        const videos = parseAtom(xml);
        const needle = pod.titleIncludes.toLowerCase();
        const matching = videos.filter((v) => v.title.toLowerCase().includes(needle));
        baseShape.episodes = matching.slice(0, PODCAST_EPISODES).map((v) => ({
          title: cleanEpisodeTitle(v.title, pod.titleIncludes),
          date: v.publishedAt.slice(0, 10),
          duration: '', // YouTube channel RSS doesn't include duration
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
  // Locate the "Upcoming presentations" / "Upcoming State of Play" section,
  // then read the first table row that follows.
  const sectionMatch = html.match(/<h[1-3][^>]*id="[^"]*Upcoming[^"]*"[^>]*>[\s\S]{0,12000}/i);
  if (!sectionMatch) return null;
  const slice = sectionMatch[0];
  const firstRowMatch = slice.match(/<tr[^>]*>[\s\S]*?<\/tr>/);
  if (!firstRowMatch) return null;
  const cells = [...firstRowMatch[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)]
    .map((m) => stripTags(m[1]).trim())
    .filter(Boolean);
  let date = '';
  let time = '';
  for (const cell of cells) {
    if (!date && /\b\d{4}\b/.test(cell) && /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(cell)) {
      date = cell;
    }
    if (!time && /\d{1,2}[:.]\d{2}\s*(am|pm|et|pt|ct|mt|utc|gmt)/i.test(cell)) {
      time = cell;
    }
  }
  if (!date) return null;
  return { date, time: time || 'TBA' };
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
