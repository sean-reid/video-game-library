# @vgl/web

Vite + React + TypeScript + Tailwind build for the Video Game Library PWA.

## Layout

```
src/
├─ App.tsx                  Top-level composition (~150 lines)
├─ main.tsx                 createRoot + SW registration
├─ components/
│  ├─ cards/                GameCard, HeadlineCard, PodcastCard, RecCandidateCard
│  ├─ charts/               SpiderChart, TierStackedBar, TopFranchises, …
│  ├─ common/               Icon, EmptyState, ErrorBoundary
│  ├─ forms/                GameForm, RawgSearch, inputs/
│  ├─ navigation/           SectionNav, TitleNav, CoverFlowRow, ListView
│  ├─ player/               PodcastPlayer (YouTube iframe + mini bar)
│  ├─ screens/              LibraryScreen, GameDetailScreen, NewsScreen, StatsScreen
│  ├─ sheets/               Sheet (a11y dialog wrapper) + AddGame, EditGame, Backup, …
│  └─ views/                Top50View, PlayingView, UpcomingView, RumoredView, RecommendedView, PlayedView
├─ data/                    seed.ts, constants.ts, platforms.ts, franchises.ts, config.ts
├─ hooks/                   useGames, useGistVault, useGistAutoSync, useRawgEnrichment, usePodcastPlayer, useNews
├─ services/                rawgApi, newsApi, gistApi, recommendations, cryptoStorage, libraryStorage, libraryIO, youtubeApi
├─ styles/                  tailwind.css, globals.css, fonts.css (latin subset)
├─ types/                   shared TypeScript surface
└─ utils/                   dateUtils, gameHelpers, stats, navOrder
```

Heavy screens (Stats / News / GameDetail / PodcastPlayer) are `lazy()`-loaded
behind a `<Suspense>` boundary in `App.tsx`; LibraryScreen stays eager.
`SEED_GAMES` dynamic-imports on first boot only.

## Develop

```sh
pnpm --filter @vgl/web dev                     # http://localhost:5173
```

Optional env vars in `.env.development.local`:

```
VITE_WORKER_URL=https://vgl-news-dev.<you>.workers.dev
```

Without it, dev hits the codeowner's deployed worker.

## Test

```sh
pnpm --filter @vgl/web test                    # Vitest unit (tests/unit/)
pnpm --filter @vgl/web test:e2e                # Playwright visual regression
```

E2E baselines live under `tests/e2e/visual.spec.ts-snapshots/` and are
committed per-platform (`-darwin.png`, `-linux.png`). Update with
`pnpm --filter @vgl/web exec playwright test --update-snapshots`. Regenerate
the Linux baseline inside Docker:

```sh
docker run --rm -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.61.0-noble \
  bash -c "npm install -g pnpm@9.12.0 && rm -rf node_modules apps/*/node_modules && \
    pnpm install --frozen-lockfile --config.engine-strict=false && \
    pnpm --filter @vgl/web build && \
    pnpm --filter @vgl/web exec playwright test --update-snapshots"
```

## Build

```sh
pnpm --filter @vgl/web build                   # → apps/web/dist/
```

The build injects a strict CSP `<meta>` into `index.html` (script-src
restricted to self + youtube.com; image origins broad to allow news article
heroes; frame-src locked to youtube.com / youtube-nocookie.com). See
`vite.config.ts` for the full policy.
