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

// `dedicated: true` means the feed is gaming-only — we trust it.
// `dedicated: false` means we require a gaming keyword in the article before
// accepting it (Engadget covers all consumer tech, Polygon covers movies/TV,
// etc.)
const RSS_SOURCES = [
  { source: 'Nintendo Life',    url: 'https://www.nintendolife.com/feeds/news',          dedicated: true  },
  { source: 'PlayStation Blog', url: 'https://blog.playstation.com/feed/',               dedicated: true  },
  { source: 'Polygon',          url: 'https://www.polygon.com/rss/index.xml',            dedicated: false },
  { source: 'IGN',              url: 'https://feeds.feedburner.com/ign/games-all',       dedicated: true  },
  { source: 'Engadget',         url: 'https://www.engadget.com/rss.xml',                 dedicated: false },
  { source: 'Push Square',      url: 'https://www.pushsquare.com/feeds/news',            dedicated: true  },
  { source: 'GamesRadar+',      url: 'https://www.gamesradar.com/all-articles/rss/',     dedicated: false },
  { source: 'Vice',             url: 'https://www.vice.com/en/rss',                      dedicated: false },
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

// For Vice — only keep URL paths that are clearly gaming.
const VICE_KEEP = /\/(games?|gaming|waypoint)(\/|$|-)/i;

// Drop articles whose title makes them clearly NOT about video games.
// Two halves: general signals (movie, TV, comic, etc.) and specific
// franchise names that are *only* TV/film (no game equivalent we care about).
const NON_GAMING_TITLE_RE = /\b(movie|film(?!s?\s+(festival|score))|tv\s+show|tv\s+series|television series|series\s+(finale|premiere|renewed|cancell)|season\s+(finale|premiere|\d)|miniseries|streaming\s+series|netflix\s+(series|show|original)|hbo\s+(max\s+)?(series|show)|disney\+\s+(series|show)|apple\s+tv\+\s+(series|show)|prime\s+video\s+(series|show)|comic\s+book(?!\s+game)|graphic\s+novel|manga(?!\s+(game|adaptation))|anime\s+(series|season|episode)|album\s+release|world\s+tour|music\s+video|talk\s+show|late\s+night|wrestlemania|super\s+bowl|olympics|game\s+of\s+thrones|house\s+of\s+the\s+dragon|stranger\s+things|squid\s+game(?!\s+(unleashed|mobile))|wednesday(?:\s+(season|episode|series|netflix))?|emilia\s+clarke|daenerys|jon\s+snow|the\s+witcher\s+(season|episode|netflix\s+series)|breaking\s+bad|better\s+call\s+saul|wandavision|loki\s+season|euphoria)\b/i;

// Articles whose title/excerpt strongly signals gaming. Used both as an
// override for the non-gaming filter (e.g. "Movie tie-in game launched")
// AND as the gating signal for mixed-content sources (Engadget, Polygon,
// Vice, GamesRadar+) — those sources need a gaming keyword for an article
// to be kept at all.
const GAMING_SIGNALS_RE = /\b(?:video\s*games?|gameplay|gamer|gaming|playstation|ps[1-9]\b|xbox|nintendo|switch\s*2?\b|steam\s*deck|steam\b|game\s*pass|dlc|expansion\s+(?:pack|game)|console\b|esports?|speedrun|emulat|controller|gamepad|joy[- ]?con|dualsense|game\s+(?:launch|reveal|release|review|trailer|preview|update|patch|delay|announced|drops?|hits?|coming|of\s+the\s+year)|launch\s+title|exclusive\s+(?:game|title)|RPG\b|FPS\b|MMO\b|battle\s+royale|metroidvania|roguelike|soulslike|Pokémon|Pokemon|Mario|Zelda|Sonic|Final\s+Fantasy|Grand\s+Theft\s+Auto|GTA\s*VI?|Call\s+of\s+Duty|Hogwarts\s+Legacy|Spider-?Man\s+2?|Last\s+of\s+Us|God\s+of\s+War|Ghost\s+of\s+(?:Tsushima|Yotei|Yōtei)|Metroid|Splatoon|Halo|Forza|Hollow\s+Knight|Silksong|Marvel'?s\s+\w+|Star\s+Wars\s+(?:Jedi|Outlaws|Galactic)|Tomb\s+Raider|Clair\s+Obscur|Death\s+Stranding|Mixtape|Pokopia|Activision|Ubisoft|Bethesda|Capcom|Konami|Sega|Square\s+Enix|Bandai\s+Namco|FromSoftware|Insomniac|Naughty\s+Dog|Game\s+Freak|Bungie|Riot\s+Games|Valve\b|Epic\s+Games|Annapurna|Rockstar|Sony\s+Interactive)\b/i;

const WIKIPEDIA_EVENT_SOURCES = [
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
      const sopHeadlines = headlines.filter(h => /state of play/i.test(h.title || ''));
      const ndHeadlines = headlines.filter(h => /nintendo direct/i.test(h.title || ''));
      const events = await fetchAllEvents(headlines);
      return jsonResponse({
        totalHeadlines: headlines.length,
        stateOfPlayMentions: sopHeadlines.map(h => ({ source: h.source, title: h.title, publishedAt: h.publishedAt, url: h.url })),
        nintendoDirectMentions: ndHeadlines.map(h => ({ source: h.source, title: h.title, publishedAt: h.publishedAt, url: h.url })),
        events,
      });
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
  // Headlines feed BOTH the headlines list AND the event detection (so we can
  // catch a State of Play announcement that Wikipedia hasn't logged yet).
  const [headlines, podcasts] = await Promise.all([
    fetchAllHeadlines(),
    fetchAllPodcasts(),
  ]);
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

        // Drop articles that are clearly NOT about video games (movies, TV
        // shows, comics, anime, music). Gaming signals override.
        items = items.filter((it) => {
          const haystack = `${it.title || ''} ${it.excerpt || ''}`;
          if (GAMING_SIGNALS_RE.test(haystack)) return true;
          return !NON_GAMING_TITLE_RE.test(it.title || '');
        });

        // Mixed-content sources: require an explicit gaming signal somewhere
        // in title/excerpt/URL. Drops Engadget's Apple/Google/Tesla coverage,
        // Polygon's movie/TV pieces, GamesRadar's entertainment posts, etc.
        if (!src.dedicated) {
          items = items.filter((it) =>
            GAMING_SIGNALS_RE.test(`${it.title || ''} ${it.excerpt || ''} ${it.url || ''}`)
          );
        }

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
async function fetchAllEvents(headlines) {
  // 1) Try Wikipedia (works once the page is updated, but they're slow).
  const wikiEvents = await Promise.all(
    WIKIPEDIA_EVENT_SOURCES.map(async (ev) => {
      try {
        const html = await fetchText(ev.url);
        const upcoming = extractWikipediaUpcoming(html);
        if (!upcoming) return null;
        const parsedDate = parseEventDate(upcoming.date);
        const dateSlug = parsedDate
          ? parsedDate.toISOString().slice(0, 10)
          : upcoming.date.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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
    })
  );

  // 2) Scan recent headlines for event announcements — catches fresh news
  //    Wikipedia hasn't logged yet (announcements come hours/days before).
  const headlineEvents = extractEventsFromHeadlines(headlines || []);

  // 3) Merge + dedupe by type+date.
  return dedupeEvents([...wikiEvents.filter(Boolean), ...headlineEvents]);
}

function dedupeEvents(events) {
  const seen = new Map();
  for (const ev of events) {
    // Loose key — same type within a few days = same event
    const ts = parseEventDate(ev.date)?.getTime();
    const dayKey = ts ? Math.floor(ts / 86400000) : ev.date;
    const key = `${ev.type}-${dayKey}`;
    if (!seen.has(key)) seen.set(key, ev);
  }
  return [...seen.values()];
}

function extractEventsFromHeadlines(headlines) {
  const events = [];
  for (const h of headlines) {
    const text = `${h.title || ''} ${h.excerpt || ''}`;
    const titleOnly = h.title || '';

    const isStateOfPlay = /state of play/i.test(text);
    // Exclude past-coverage headlines — check title only to avoid catching
    // an excerpt that mentions "highlights from previous shows" in a
    // forward-looking announcement.
    const isPastCoverage = /\b(recap|everything announced|highlights|round-?up|here's what|takeaways|reaction|aftermath|takeaway)\b/i.test(titleOnly);
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

    const type = isStateOfPlay ? 'playstation' : 'nintendo';
    const title = isStateOfPlay ? 'Sony State of Play' : 'Nintendo Direct';
    const accent = isStateOfPlay ? '#3b82f6' : '#dc2626';

    events.push({
      id: `${type}-${parsed.toISOString().slice(0, 10)}`,
      type,
      title,
      date: parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      time: extractTimeFromText(text) || 'TBA',
      accent,
      _source: 'headlines',
      _from: h.source,
      _matchedTitle: h.title,
    });
  }
  return events;
}

function extractDateFromText(text, contextDate) {
  const monthRe = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)';
  // "June 2, 2026", "Jun 2 2026", "June 2nd", "2nd of June"
  let m = text.match(new RegExp(`\\b${monthRe}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, 'i'));
  if (!m) m = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${monthRe}(?:,?\\s*(\\d{4}))?\\b`, 'i'));
  if (!m) return null;

  const months = { january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11 };
  let monthName, day, year;
  if (months[m[1].toLowerCase()] !== undefined) {
    monthName = m[1]; day = parseInt(m[2], 10); year = m[3] ? parseInt(m[3], 10) : null;
  } else {
    day = parseInt(m[1], 10); monthName = m[2]; year = m[3] ? parseInt(m[3], 10) : null;
  }
  const month = months[monthName.toLowerCase()];
  if (month === undefined || !day) return null;

  if (!year) {
    // Anchor to the article's publish date when available — "June 2" in an
    // article published May 20, 2026 almost certainly means June 2, 2026,
    // even if the Worker's wall clock is in a different year.
    const anchor = contextDate || new Date();
    const anchorYear = anchor.getFullYear();
    const candidate = new Date(anchorYear, month, day);
    // If the candidate is well before the anchor, the event is next year.
    year = candidate.getTime() < anchor.getTime() - 30 * 86_400_000 ? anchorYear + 1 : anchorYear;
  }

  return new Date(year, month, day);
}

function extractTimeFromText(text) {
  return extractTimeFromCell(text) || null;
}

function extractWikipediaUpcoming(html) {
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
  return { date: candidates[0].date, time: candidates[0].time };
}

// Permissive time extractor — handles "5:00 PM EDT", "17:00 UTC",
// "5 p.m.", "2 PM Pacific". Returns the full matched substring.
function extractTimeFromCell(cell) {
  // 1) HH:MM with optional am/pm and timezone — e.g. "5:00 PM EDT", "17:00 UTC"
  let m = cell.match(/\b(\d{1,2}):(\d{2})\s*(?:(am|pm|a\.m\.|p\.m\.)\s*)?(?:\(?\s*(UTC|GMT|EST|EDT|PST|PDT|CST|CDT|MST|MDT|ET|PT|CT|MT|JST|CET|Pacific|Eastern|Central|Mountain)\s*\)?)?/i);
  if (m) return m[0].trim();
  // 2) Hour with am/pm (no minutes) — e.g. "2 PM Pacific"
  m = cell.match(/\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)\s*(?:\(?\s*(UTC|GMT|EST|EDT|PST|PDT|CST|CDT|MST|MDT|ET|PT|CT|MT|JST|CET|Pacific|Eastern|Central|Mountain)\s*\)?)?/i);
  if (m) return m[0].trim();
  return '';
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
// FULL ARTICLE FETCH + CONTENT EXTRACTION
// =============================================================================
async function getArticleCached(articleUrl, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(
    `https://cache.vgl/article-v1?url=${encodeURIComponent(articleUrl)}`
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

function parseArticle(html, sourceUrl) {
  const title = extractMeta(html, 'og:title') || extractField(html, 'title');
  const byline = extractMeta(html, 'article:author') || extractMeta(html, 'author');
  const publishedAt =
    extractMeta(html, 'article:published_time') || extractMeta(html, 'pubdate');
  const heroImage =
    extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image');
  const siteName = extractMeta(html, 'og:site_name');
  const description =
    extractMeta(html, 'og:description') || extractMeta(html, 'description');

  const content = extractArticleContent(html);

  return {
    title: cleanEntities(title || ''),
    byline: byline ? cleanEntities(byline) : null,
    publishedAt: publishedAt || null,
    heroImage: heroImage || null,
    siteName: siteName ? cleanEntities(siteName) : new URL(sourceUrl).hostname,
    description: description ? cleanEntities(description) : null,
    content,
    sourceUrl,
  };
}

function extractMeta(html, name) {
  const escName = name.replace(/[:.]/g, '\\$&');
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escName}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escName}["']`,
    'i'
  );
  const m = html.match(re1) || html.match(re2);
  return m?.[1] || null;
}

function extractArticleContent(html) {
  // Try common content containers in order — first match wins.
  const patterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]+class=["'][^"']*(?:c-entry-content|article-content|article__content|article-body|post-content|entry-content|story-content|content-body|article__main|m-detail--body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<section[^>]+class=["'][^"']*(?:article|story)[^"']*["'][^>]*>([\s\S]*?)<\/section>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ];

  let raw = null;
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      raw = m[1];
      break;
    }
  }
  if (!raw) return '';
  return cleanArticleHtml(raw);
}

function cleanArticleHtml(html) {
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
    ''
  );
  // Strip iframes except YouTube / Vimeo embeds
  s = s.replace(
    /<iframe[^>]+src=["'](?!https?:\/\/(?:www\.)?(?:youtube|vimeo)\.com)[^"']*["'][^>]*>[\s\S]*?<\/iframe>/gi,
    ''
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
