# Architecture

A one-page map of how the codebase fits together. Reach for [`README.md`](README.md)
for the contributor's run/test/build flow; this file is for the "where do I
add the thing I'm thinking about adding" question.

## Two apps in one repo

- `apps/web` is a Vite + React + TypeScript PWA. Single-screen + tabs UI,
  mobile-first, installable. Owns its build, its CSS, its Tailwind config,
  and its service worker.
- `apps/worker` is a Cloudflare Worker. It aggregates RSS / YouTube / events
  into `/news`, parses article HTML at `/article`, and proxies RAWG at
  `/rawg/*`. Has its own Wrangler config with `dev` and `prod` environments
  on separate Cloudflare accounts.

The two ship independently. The web app's `WORKER_BASE` points at whichever
worker URL the env var (or fallback) names; nothing in `apps/web` imports
from `apps/worker`.

## `apps/web/src` layout

```
App.tsx                  Composition root (~150 lines). Wires hooks into screens.
main.tsx                 createRoot, SW registration, side-effect CSS imports.

components/
├─ cards/                Visual cards (game, headline, podcast, rec candidate).
├─ charts/               Hand-rolled SVG charts for Stats.
├─ common/               Icon, EmptyState, ErrorBoundary, ConfirmPanel.
├─ forms/                GameForm + RawgSearch + per-field inputs/.
├─ navigation/           SectionNav, TitleNav, CoverFlowRow.
├─ player/               PodcastPlayer (the YouTube iframe lives here).
├─ screens/              LibraryScreen, GameDetailScreen, NewsScreen, StatsScreen.
├─ sheets/               Bottom-sheet modals (Sheet wrapper + Add/Edit/Backup/Reader/PodcastList/RecAction).
└─ views/                The six library tab bodies (Top50, Playing, Upcoming, Rumored, Recommended, Played).

data/                    Constants + the SEED_GAMES library (seed.ts ships in its own lazy chunk).
hooks/                   useGames, useGistVault, useGistAutoSync, useRawgEnrichment, usePodcastPlayer, useNews.
services/                One file per external surface (rawgApi, gistApi, newsApi, youtubeApi),
                         plus pure persistence (libraryStorage, libraryIO, recommendations, cryptoStorage).
styles/                  Tailwind entry + custom CSS + @fontsource imports.
types/                   Shared TypeScript surface (Game, Headline, GistSyncConfig, …).
utils/                   Pure helpers (dateUtils, gameHelpers, stats, navOrder, reportError).
```

A few invariants worth knowing about before touching anything:

- **Storage keys are wire-stable.** `STORAGE_KEY = 'vgl.games.v4'`, `GIST_KEY`,
  `READ_KEY`, etc. live in `data/config.ts`. Don't rename - existing users'
  data is keyed on these strings. A version bump means writing a migrator
  in the loader.
- **Service-to-component direction.** Components import from hooks and
  services. Hooks import from services. Services import from data/utils.
  Don't reverse - a service should never import a component.
- **Lazy boundary.** `App.tsx` lazy-loads `NewsScreen`, `StatsScreen`,
  `GameDetailScreen`, and `PodcastPlayer` so the initial bundle stays small.
  `LibraryScreen` is eager because it's the landing tab. Adding another
  heavy screen? Lazy-load it.
- **Seed is lazy too.** `loadGames()` returns `null` when localStorage is
  empty; `useGames` dynamic-imports `data/seed.ts` and patches it in.
  `seed.ts` shouldn't be imported synchronously anywhere - that breaks the
  lazy chunk.
- **Catches that swallow.** Anything that catches and recovers without a
  user-visible message routes through `utils/reportError.ts` with a stable
  `scope.subscope` tag, so a future telemetry pipeline picks them up for
  free. Intentional silence (e.g. `cryptoStorage.decryptSecret` returning
  null on wrong passphrase) is fine - comment why.
- **Rank sentinel.** Anywhere a missing `topListRank` needs a sort
  fallback, import `RANK_SENTINEL` from `utils/gameHelpers.ts`. Don't
  reintroduce `999`/`9999`.

## `apps/worker/src` layout

```
index.ts                 Router. Per-path delegation; CORS wrapping.
config.ts                URLs, TTLs, allowlists.
env.ts                   Cloudflare env interface + allowedOrigins / isDebug.
cache.ts                 /news + /article handlers with edge cache wrapping.
news-bundle.ts           Composes the /news payload from sources/.
youtube-resolver.ts      Resolves channel handles → uploads playlist.

sources/                 RSS / YouTube / Wikipedia ingest, one file each.
parsers/                 HTML parsing (article body, RSS feeds, YouTube watch pages).
proxies/rawg.ts          /rawg/* path allowlist + param allowlist + edge cache.
filters/                 Trims + de-dups + age-gates the aggregated bundle.
utils/                   fetch (with SSRF-safe redirect helper), http (JSON + CORS).
```

Invariants:

- **All RAWG traffic stays server-side.** The web app calls
  `${WORKER_BASE}/rawg/*`. The worker injects the API key from a Cloudflare
  secret. There should be no `api.rawg.io` URL anywhere in `apps/web`.
- **`/article` fetches use `fetchTextWithAllowlistedRedirects`.** Plain
  `fetchText` follows redirects with `redirect: 'follow'` by default, which
  is an SSRF vector. The allowlisted helper re-validates every Location
  against the host allowlist.
- **CORS in prod is restrictive.** Without `ALLOWED_ORIGINS` set, prod
  (`DEBUG=false`) returns only the Pages origins. Dev (`DEBUG=true`)
  additionally returns localhost. Override per-env via the Wrangler secret
  if you need a different surface.

## Security boundaries

- **Article HTML** is sanitised by DOMPurify before
  `dangerouslySetInnerHTML` in `ReaderSheet`. Allowlist limits tags and
  URIs; see the `PURIFY_CONFIG` constant.
- **YouTube iframe** is sandboxed (`allow-scripts allow-same-origin
allow-presentation`) plus `allow="autoplay; encrypted-media;
picture-in-picture"` and `referrerpolicy="origin"`. Don't loosen any of
  these without re-checking that the player still functions and that the
  Playwright spec under `tests/e2e/podcast-playback.spec.ts` still passes.
- **Gist PAT is AES-GCM at rest** under a PBKDF2-derived key (250k iters,
  SHA-256, 16-byte salt + 12-byte IV per secret). The cleartext token only
  exists in memory while the vault is unlocked. Legacy v1 configs (token
  in plaintext) are deliberately ignored so users reconnect under the
  encrypted shape.
- **Prod CSP** is injected into `index.html` by a build-only Vite plugin.
  Dev gets no CSP so HMR + eval + ws work. Source: `vite.config.ts`. If
  you add a new third-party origin (script, frame, image), update the CSP
  there too.
- **SW push payloads** are clamped on receive and the notification URL is
  forced same-origin http(s). A hostile push can't drive `clients.openWindow`
  to a `javascript:` or foreign destination.

## CI / deploy

- `.github/workflows/ci.yml` runs lint, typecheck, format:check, unit,
  build, bundle-budget check, then Playwright (chromium + webkit) on every
  PR and every push to `main` / `modernization`.
- `.github/workflows/deploy.yml` runs on push to `main` in the upstream
  repo only. Builds the web app and deploys to GitHub Pages; runs
  `wrangler deploy --env prod` against the codeowner Cloudflare account.
- `.github/dependabot.yml` opens weekly grouped npm + Actions PRs.
- `apps/web/bundle-budget.json` enforces per-chunk and total JS caps.
  Update the file alongside any intentional chunk growth.

## Adding things

- **A new tab.** Build a screen under `components/screens/`; add it to the
  `TopTab` union in `components/navigation/TitleNav.tsx`; lazy-load it from
  `App.tsx`; add a budget entry in `apps/web/bundle-budget.json`.
- **A new sheet.** Drop the form/content under `components/sheets/`; wrap
  with `<Sheet>` for the standard chrome (gets `role="dialog"`, focus trap,
  Escape, focus return for free).
- **A new chart.** Add to `components/charts/`. Pure SVG, no chart libs.
- **A new external API.** Service file under `services/`. If it needs a
  secret, that secret stays on the worker - proxy through `apps/worker`.
- **A new background hook.** Hook file under `hooks/`. If it owns persistent
  state, also write a small unit test under `tests/unit/`.
