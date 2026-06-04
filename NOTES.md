# Video Game Library — Project state

## Repo
- App: index.html (single-file React via Babel standalone + Tailwind CDN)
- Cloudflare Worker: worker.js → deployed at https://vgl-news.danrstaton.workers.dev
- Static site hosted via GitHub Pages from main branch

## Storage keys (localStorage)
- vgl.games.v4              — library JSON
- vgl.news.v2               — cached worker response
- vgl.readArticles.v1       — set of article IDs marked read
- vgl.dismissedBanners.v1   — set of event banner IDs dismissed
- vgl.gistSync.v1           — { token, gistId, gistUrl, lastSyncedAt }
- vgl.recs.v1               — { fetchedAt, candidates[], dismissedIds[] } "For you" cache (24h TTL)

## Worker endpoints
- GET /         health check
- GET /news     full bundle: { fetchedAt, headlines, podcasts, events }
- GET /article  ?url=... fetches + extracts article body
- GET /debug    diagnostics for State of Play / Direct detection

## RAWG
- API key inlined in index.html
- Auto-enriches games on first load (covers, dates, platforms)
- Manual COVER_OVERRIDES map handles RAWG mismatches

## Done so far
- Library sections: Top 50 with Cover Flow / Playing / Upcoming / Rumored / Recommended / Played
- 10-category rating with auto-rerank on score change (Masterpiece 100 / Amazing 90-99 / Great 80-89)
- Top 50 floor: games dropping below 80 auto-lose their topListRank
- News: live feed from Worker (Nintendo Life, PlayStation Blog, Polygon, IGN, Engadget, Push Square, GamesRadar+, Vice) + Wikipedia events + KFGD/KFG from KF YouTube channel
- In-app article reader (.article-body CSS), Mark as Read, 🎮 image fallback
- GitHub Gist auto-sync backup (5 sec debounce after any library change) — including "Connect to existing Gist" flow for new-device restore
- Pull-to-refresh on News, error boundary wrapping the app
- News cache treated as stale after 30 min (NEWS_STALE_MS). Stale-cache mount sets loading=true so the time-sensitive "Today's podcasts" row shows a skeleton instead of flashing a "5 DAYS AGO" episode that's no longer actually the latest. Cached headlines stay visible since they're not time-labeled the same way.
- Library matching (gold star on headlines mentioning tracked games)
- Filter chips: All / In Library / Nintendo / PlayStation / Reviews / Upcoming / Hardware
- Editorial design: Lora serif + Inter sans, dark glass aesthetic, source-colored badges
- Custom 🎮 PWA icon (180/167/192/512), manifest.json, service worker (no real push yet)
- **Stats page** — third TitleNav tab. Two hero tiles (Played / Lifetime hours), then four sections:
  - "Score vs. release year" — horizontal stacked bars per year (most-recent first, back through 2017), tiers = Masterpiece / Amazing / Great / Played (non-Top 50).
  - "Score vs. system" — same stacked-bar shape per platform, sorted by total played.
  - "What you value" — predictiveness radar. For each rubric category, lift = avg(C among Masterpieces) − avg(C among non-Masterpiece Top 50). Max lift reaches outer ring; 0 sits at center. Reveals which categories actually distinguish Masterpieces (e.g. Audio and Endurance can rank higher than Narrative even when Narrative averages high overall).
  - "Top franchises" — vertical list of series with ≥2 games, sorted by count then avg score (top 10). Each row: thumbnail (highest-rated series game with a cover, fallback most-recent), franchise label, count + masterpieces, avg score badge tier-colored. Franchises derived from FRANCHISE_RULES title-prefix regexes (ordered most-specific first).
  - "Completion" — story / platinum / replayed bars (moved to bottom).
  All hand-rolled SVG / div bars, computed in computeStats(games).
- **In-app YouTube player** — PodcastPlayer lifted to App level so the iframe survives tab/screen changes. Two modes:
  - Expanded: full-screen sheet with YouTube IFrame (controls=0, modestbranding, playsinline), custom transport (±15s skip with circular-arrow icons, big play/pause, scrubber with current/total time, minimize ▾ and close ✕ in header).
  - Mini: thin glass bar pinned to bottom safe area with show name + truncated title + play/pause + close. Tap anywhere else to re-expand. Iframe is parked off-screen (left: -10000px, 1×1 px) so audio keeps playing.
  - YouTube IFrame API loaded once via `loadYouTubeApi()` promise. State updates polled at 500ms while playing. Media Session API metadata + play/pause/seekbackward/seekforward handlers wired best-effort for lockscreen control (iOS PWA + iframe is known flaky).
  - PodcastCard + PodcastListSheet's old `<a target="_blank">` YouTube links now call `onPlay(pod, episode)`; openPodcast in NewsScreen drops Spotify/_linkOut and calls App-level `playEpisode`. ReaderSheet is now articles-only (podcast branch removed).
- Backup & data sheet — consolidated import/export plus Gist sync under a single sliders icon (settings icon name)
- Spotify integration removed (was linking wrong shows); YouTube buttons go direct to YouTube via <a target="_blank">
- **Recommended for you** — Recommended section split into two rows:
  - "For you" — horizontal RAWG-driven row. Taste profile = platforms by played-game score sum, devs/publishers by Top 50 presence (+3 bonus per Top 50 game), genres by score + Top 50 bonus. Queries RAWG with metacritic≥75 + top platforms, joined on top devs/publishers/genres in 3 parallel queries, dedupes by RAWG id, scored against the profile. Cached 24h to vgl.recs.v1. Top 50 games get a one-time /games/{id} backfill for developers/publishers (~50 calls).
  - "Saved for later" — existing manual recommended list (state='recommended'), unchanged grid layout.
  - Tap a "For you" card → bottom action sheet: Save for later (adds with state='recommended') / Dismiss (adds rawgId to dismissedIds). Owned + dismissed are filtered at render.
  - Enrichment now also captures rawgGenres + rawgMetacritic from the existing search response (free, no extra API calls).

## Still planned (in priority order)
- (nothing big in queue — open thread.)

## Stats page extensions (not yet built)
- Filter the stats by platform / tier / year ("show me my taste profile for just PS5 games")
- Score trend over time (would need rating-change history; not currently stored)

## Open questions / known issues
- IGN's games-all feed occasionally lets through entertainment crossover (e.g. Game of Thrones references). NON_GAMING_TITLE_RE in worker.js catches the common ones but isn't exhaustive.
- Worker /article extraction works best on Polygon, IGN, Engadget, Nintendo Life, PlayStation Blog. Sites with unusual layouts may return sparse content — extend the content-pattern list in extractArticleContent() if needed.
- Worker has a `_debug` field in podcast responses. Could strip for production size optimization (~5 min cleanup).
- Vice's gaming feed is essentially defunct since Waypoint shut down; VICE_KEEP URL filter is strict so most Vice items get dropped now. Could remove Vice from RSS_SOURCES entirely.
- Lockscreen Media Session for YouTube iframe on iOS PWA is the biggest unknown for feature #3.

## Worker structure (for fresh-context reference)
- RSS_SOURCES: array with { source, url, dedicated: bool }. Dedicated sources trust the feed; mixed sources require GAMING_SIGNALS_RE match in title/excerpt/URL.
- PODCAST_SOURCES: array with { youtubeHandle, titlePatterns }. Handle resolved once via channel page scrape, channel RSS fetched once per channel (shared between shows on same channel).
- WIKIPEDIA_EVENT_SOURCES: Nintendo_Direct + State_of_Play_(video_program). Parser walks every <tr>, finds future-dated rows, picks soonest.
- Falls back to scanning headlines for "State of Play" / "Nintendo Direct" + parseable date if Wikipedia is stale.
- Edge-cached 30 min for /news, 7 days for /article.

## How to resume
Start a fresh chat with:
> Continue building my video game library app at ~/video-game-library. Read NOTES.md for context.
