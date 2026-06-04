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
- Game detail screen: tap-to-toggle Story/Platinum/Replayed status tiles (no edit pencil needed — `toggleCompletion(id,key)` in App). Left/right arrows on the hero step prev/next through the current section's order (`buildNavOrder(games, section)`); arrows hide at the ends. GameCard shows gold platinum-trophy + replayed-arrow pills next to the #rank badge when those completions are on.
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
  - "Top franchises" — vertical list of series with ≥2 games (top 10). Segmented sort control with 3 modes: "Overall" (default), "Number of games", "Top score". Overall = (countNorm + scoreNorm)/2 where countNorm = log(1+count)/log(1+maxCount) (LOG, not linear — diminishing returns so the first games matter most) and scoreNorm = clamp((avgScore−80)/20, 0..1). Blends breadth + quality so a deep high-scoring series (Mario 16g/95) tops a tiny perfect one (Astro 2g/97, which falls off the top 10), and a 4g/97 series clears a 2g/100 one — while a big score gap still lets a smaller franchise win (3g/100 beats 6g/95.8). computeStats returns the FULL franchise list; the TopFranchises component sorts + slices(10) by its local `sort` state. Each row: thumbnail (highest-rated series game with a cover, fallback most-recent), franchise label, count + masterpieces, avg score badge tier-colored. Franchises derived from FRANCHISE_RULES title-prefix regexes (ordered most-specific first).
  - "Completion" — story / platinum / replayed bars (moved to bottom).
  All hand-rolled SVG / div bars, computed in computeStats(games).
- **In-app YouTube player** — PodcastPlayer lifted to App level so the iframe survives tab/screen changes. ONE fixed iframe is positioned over a measured "slot" (slotRef.getBoundingClientRect, re-measured via ResizeObserver on the sheet since the bottom-anchored sheet grows upward when chapters render). pointer-events-none on the iframe so all interaction goes through our controls. Two modes:
  - Expanded: bottom sheet (max-h 92vh, bottom-anchored so controls clear the iOS status bar) with a tappable scrim behind it (tap scrim / drag-handle / ▾ → collapse to mini; ✕ → stop). Video at top, then title + "YouTube ↗" open-in-app link, scrubber, ±15s transport, then a scrollable Chapters list. Everything above chapters is shrink-0; chapters are flex-1 min-h-0 overflow-y-auto so they never push controls/close off-screen.
  - iframe horizontal size/centering is pure CSS (`width: min(calc(100vw - 32px), 416px)`, margin auto, height = width × 0.5625) — only the vertical `top` is measured. This avoids an iOS bug where a measured-pixel width on a position:fixed element overflowed the right edge (measured fine in desktop preview, broke on real Safari/PWA). iframe keeps pointer-events ON so tapping the video toggles play/pause; the "YouTube ↗" link opens the video in the YouTube app at the live position (`youtubeUrlAt(currentTime)` reactive href + an onClick that rewrites href from `getCurrentTime()` just before navigation, so it resumes from wherever you are right now).
  - PERF/STABILITY: the slot-measure ResizeObserver callback is coalesced to one rAF AND setSlotRect bails when the rect is unchanged. Earlier it set a fresh rect object on every observer notification → ResizeObserver→setState→re-render→observer feedback loop that saturated the main thread and made the app go sluggish/unresponsive (had to restart). Also the chapter row list is a useMemo keyed on [chapters, activeChapterIdx, seekTo] (seekTo is useCallback) so it isn't rebuilt on every 500ms currentTime poll. Verified: 8 rapid expand/collapse cycles stay responsive, exactly one YT iframe (no orphan players), no console errors.
  - Mini: thin glass bar pinned to bottom safe area with show name + truncated title + play/pause + close. Tap to re-expand (iframe re-measures + re-aligns to the slot). Iframe parked off-screen (left: -10000px, 1×1 px) so audio keeps playing.
  - Chapters: parseChapters(episode.description) pulls `m:ss / mm:ss / h:mm:ss` leading-timestamp lines (needs ≥2). worker.js now sends episode.description (media:description, capped 4000 chars) — **needs a worker redeploy for chapters to show in production**. Tapping a chapter seeks + plays; active chapter (last whose time ≤ now) is highlighted.
  - YouTube IFrame API loaded once via `loadYouTubeApi()` promise. State polled at 500ms. Media Session metadata + play/pause + seekbackward/seekforward (10s, matching iOS native) + prev/next + setPositionState, all best-effort.
  - **Lock-screen playback is a platform wall**: iOS Safari/PWA does NOT keep a YouTube iframe playing once the screen locks, and Media Session lock-screen controls only surface for media the OS itself plays (HTML5 audio/video), not third-party iframes. No reliable workaround without extracting the audio stream (against YT ToS). Handlers are wired so IF the controls ever appear they work, but background-locked playback isn't achievable here.
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
- Lockscreen background playback for a YouTube iframe on iOS PWA is NOT achievable (see player notes above) — confirmed platform limitation, not a TODO.
- **Worker currently returns 0 podcast episodes for both KF shows** (observed 2026-06-04 via /news?nocache=1). Likely the channel handle→ID resolve or titlePattern match broke (KF may have changed video title formats, or the channel-page scrape regex needs updating). Check baseShape._debug.recentVideoTitles vs PODCAST_SOURCES titlePatterns. Until fixed, podcasts + chapters won't appear in production regardless of the client.
- **worker.js change pending deploy**: episodes now include `description` (for client chapter parsing). Redeploy the worker to ship it.

## Worker structure (for fresh-context reference)
- RSS_SOURCES: array with { source, url, dedicated: bool }. Dedicated sources trust the feed; mixed sources require GAMING_SIGNALS_RE match in title/excerpt/URL.
- PODCAST_SOURCES: array with { youtubeHandle, titlePatterns }. Handle resolved once via channel page scrape, channel RSS fetched once per channel (shared between shows on same channel).
- WIKIPEDIA_EVENT_SOURCES: Nintendo_Direct + State_of_Play_(video_program). Parser walks every <tr>, finds future-dated rows, picks soonest.
- Falls back to scanning headlines for "State of Play" / "Nintendo Direct" + parseable date if Wikipedia is stale.
- Edge-cached 30 min for /news, 7 days for /article.

## How to resume
Start a fresh chat with:
> Continue building my video game library app at ~/video-game-library. Read NOTES.md for context.
