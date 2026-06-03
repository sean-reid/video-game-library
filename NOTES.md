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
- Library matching (gold star on headlines mentioning tracked games)
- Filter chips: All / In Library / Nintendo / PlayStation / Reviews / Upcoming / Hardware
- Editorial design: Lora serif + Inter sans, dark glass aesthetic, source-colored badges
- Custom 🎮 PWA icon (180/167/192/512), manifest.json, service worker (no real push yet)
- **Stats page** — third TitleNav tab. Hero tiles (Played/Avg/Top50 avg/Total hours), score distribution histogram, taste profile radar, by-platform bars, by-year line chart, completion bars, score vs release-year scatter. All hand-rolled SVG, computed in computeStats(games).
- Backup & data sheet — consolidated import/export plus Gist sync under a single sliders icon (settings icon name)
- Spotify integration removed (was linking wrong shows); YouTube buttons go direct to YouTube via <a target="_blank">
- **Recommended for you** — Recommended section split into two rows:
  - "For you" — horizontal RAWG-driven row. Taste profile = platforms by played-game score sum, devs/publishers by Top 50 presence (+3 bonus per Top 50 game), genres by score + Top 50 bonus. Queries RAWG with metacritic≥75 + top platforms, joined on top devs/publishers/genres in 3 parallel queries, dedupes by RAWG id, scored against the profile. Cached 24h to vgl.recs.v1. Top 50 games get a one-time /games/{id} backfill for developers/publishers (~50 calls).
  - "Saved for later" — existing manual recommended list (state='recommended'), unchanged grid layout.
  - Tap a "For you" card → bottom action sheet: Save for later (adds with state='recommended') / Dismiss (adds rawgId to dismissedIds). Owned + dismissed are filtered at render.
  - Enrichment now also captures rawgGenres + rawgMetacritic from the existing search response (free, no extra API calls).

## Still planned (in priority order)
1. **In-app YouTube player** — embedded YouTube IFrame Player in reader sheet with custom controls (play/pause, ±15 sec skip, scrubber). Media Session API for lockscreen handlers (best effort — iOS PWA + iframe is hit-or-miss). User likes the 15-sec skip when phone is locked.

## Stats page extensions (not yet built)
- Filter the stats by platform / tier / year ("show me my taste profile for just PS5 games")
- Top franchises (would need series-tag tracking)
- Score trend over time (would need rating-change history; not currently stored)
- "Highest variance category" — which rubric category most distinguishes your top from bottom

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
> Continue building my video game library app at ~/video-game-library. Read NOTES.md for context, then let's build [YouTube player].
