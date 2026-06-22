import type { PodcastSource, RSSSource, WikipediaEventSource } from './types';

export const CACHE_TTL_SECONDS = 30 * 60; // 30 min
export const PER_SOURCE_TIMEOUT_MS = 5000;
export const HEADLINES_PER_SOURCE = 12;
export const HEADLINES_TOTAL = 100;
export const PODCAST_EPISODES = 8;
export const ARTICLE_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const RAWG_BASE = 'https://api.rawg.io/api';
export const RAWG_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Hosts the /article endpoint is willing to fetch. Sourced from RSS_SOURCES
// plus the article-host variants (some feeds live on a `feeds.` subdomain but
// the articles themselves redirect to a different host).
export const ARTICLE_ALLOWED_HOSTS: readonly string[] = [
  'nintendolife.com',
  'www.nintendolife.com',
  'blog.playstation.com',
  'polygon.com',
  'www.polygon.com',
  'ign.com',
  'www.ign.com',
  'engadget.com',
  'www.engadget.com',
  'pushsquare.com',
  'www.pushsquare.com',
  'gamesradar.com',
  'www.gamesradar.com',
  'vice.com',
  'www.vice.com',
];

// `dedicated: true` means the feed is gaming-only — we trust it.
// `dedicated: false` means we require a gaming keyword in the article before
// accepting it (Engadget covers all consumer tech, Polygon covers movies/TV,
// etc.)
export const RSS_SOURCES: RSSSource[] = [
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
export const PODCAST_SOURCES: PodcastSource[] = [
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
export const NSFW_KEYWORDS =
  /\b(porn|nude|sex|erotic|onlyfans|hentai|nsfw|escort|prostitut|fetish|kink)\b/i;

// For Vice — only keep URL paths that are clearly gaming.
export const VICE_KEEP = /\/(games?|gaming|waypoint)(\/|$|-)/i;

// Drop articles whose title makes them clearly NOT about video games.
// Two halves: general signals (movie, TV, comic, etc.) and specific
// franchise names that are *only* TV/film (no game equivalent we care about).
export const NON_GAMING_TITLE_RE =
  /\b(movie|film(?!s?\s+(festival|score))|tv\s+show|tv\s+series|television series|series\s+(finale|premiere|renewed|cancell)|season\s+(finale|premiere|\d)|miniseries|streaming\s+series|netflix\s+(series|show|original)|hbo\s+(max\s+)?(series|show)|disney\+\s+(series|show)|apple\s+tv\+\s+(series|show)|prime\s+video\s+(series|show)|comic\s+book(?!\s+game)|graphic\s+novel|manga(?!\s+(game|adaptation))|anime\s+(series|season|episode)|album\s+release|world\s+tour|music\s+video|talk\s+show|late\s+night|wrestlemania|super\s+bowl|olympics|game\s+of\s+thrones|house\s+of\s+the\s+dragon|stranger\s+things|squid\s+game(?!\s+(unleashed|mobile))|wednesday(?:\s+(season|episode|series|netflix))?|emilia\s+clarke|daenerys|jon\s+snow|the\s+witcher\s+(season|episode|netflix\s+series)|breaking\s+bad|better\s+call\s+saul|wandavision|loki\s+season|euphoria)\b/i;

// Articles whose title/excerpt strongly signals gaming. Used both as an
// override for the non-gaming filter (e.g. "Movie tie-in game launched")
// AND as the gating signal for mixed-content sources (Engadget, Polygon,
// Vice, GamesRadar+) — those sources need a gaming keyword for an article
// to be kept at all.
export const GAMING_SIGNALS_RE =
  /\b(?:video\s*games?|gameplay|gamer|gaming|playstation|ps[1-9]\b|xbox|nintendo|switch\s*2?\b|steam\s*deck|steam\b|game\s*pass|dlc|expansion\s+(?:pack|game)|console\b|esports?|speedrun|emulat|controller|gamepad|joy[- ]?con|dualsense|game\s+(?:launch|reveal|release|review|trailer|preview|update|patch|delay|announced|drops?|hits?|coming|of\s+the\s+year)|launch\s+title|exclusive\s+(?:game|title)|RPG\b|FPS\b|MMO\b|battle\s+royale|metroidvania|roguelike|soulslike|Pokémon|Pokemon|Mario|Zelda|Sonic|Final\s+Fantasy|Grand\s+Theft\s+Auto|GTA\s*VI?|Call\s+of\s+Duty|Hogwarts\s+Legacy|Spider-?Man\s+2?|Last\s+of\s+Us|God\s+of\s+War|Ghost\s+of\s+(?:Tsushima|Yotei|Yōtei)|Metroid|Splatoon|Halo|Forza|Hollow\s+Knight|Silksong|Marvel'?s\s+\w+|Star\s+Wars\s+(?:Jedi|Outlaws|Galactic)|Tomb\s+Raider|Clair\s+Obscur|Death\s+Stranding|Mixtape|Pokopia|Activision|Ubisoft|Bethesda|Capcom|Konami|Sega|Square\s+Enix|Bandai\s+Namco|FromSoftware|Insomniac|Naughty\s+Dog|Game\s+Freak|Bungie|Riot\s+Games|Valve\b|Epic\s+Games|Annapurna|Rockstar|Sony\s+Interactive)\b/i;

export const WIKIPEDIA_EVENT_SOURCES: WikipediaEventSource[] = [
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
