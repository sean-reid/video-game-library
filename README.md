# Video Game Library

A personal video game journal: track upcoming releases, rate finished games
on a 10-category rubric (out of 100), curate a Top 50, follow gaming news
feeds, and play Kinda Funny podcast episodes inline. PWA, installable on
iOS, fully offline-capable, no account required.

Library data lives in your own browser's `localStorage`. Cross-device sync
is optional and uses a private GitHub Gist on your account, with the token
encrypted at rest behind a passphrase. The app never talks to a backend we
own except a tiny Cloudflare Worker that proxies news feeds and RAWG so the
RAWG API key never reaches the client.

## Layout

```
.
├─ apps/
│  ├─ web/                  Vite + React + TypeScript + Tailwind PWA
│  └─ worker/               Cloudflare Worker (news + RAWG proxy)
├─ .github/
│  ├─ workflows/ci.yml      Lint, typecheck, unit, build, Playwright on every PR
│  ├─ workflows/deploy.yml  Pages + Wrangler on push to main
│  └─ dependabot.yml        Weekly npm + Actions updates, grouped
└─ package.json             pnpm workspace root
```

## Install

```sh
pnpm install
```

Requires Node 22+ and pnpm 9+.

## Develop

```sh
pnpm dev                                       # web + worker in parallel
pnpm --filter @vgl/web dev                     # web only (http://localhost:5173)
pnpm --filter @vgl/worker dev                  # worker only (wrangler --env dev)
```

To point the web app at your own worker, drop a `VITE_WORKER_URL` in
`apps/web/.env.development.local`. Without it, dev builds use the codeowner's
deploy.

## Test

```sh
pnpm test                                      # Vitest across both apps
pnpm test:e2e                                  # Playwright (chromium + webkit)
pnpm typecheck
pnpm lint
pnpm format:check
```

The Playwright suite under `apps/web/tests/e2e/` runs visual regression
against committed baselines (macOS + Linux) and gates merges via CI. Run
`pnpm --filter @vgl/web exec playwright test --update-snapshots` to refresh
baselines after intentional UI changes.

## Build

```sh
pnpm build                                     # builds both apps
```

`apps/web/dist/` is the deployable static site; `apps/worker/dist/` is the
Wrangler-bundled worker.

## Deploy

`main` is auto-deployed by `.github/workflows/deploy.yml` when this branch
ships. Manual steps for the initial cutover (codeowner only):

1. `wrangler secret put RAWG_API_KEY --env prod` (one-time, stdin).
2. Add `CLOUDFLARE_API_TOKEN` (scope: "Edit Cloudflare Workers") to the repo's
   Actions secrets.
3. Settings → Pages → Source: "Build from Actions".
4. Settings → Security → Dependabot: enable version updates.

After that every merge to `main` redeploys both halves.

See [`apps/web/README.md`](apps/web/README.md) and [`apps/worker/README.md`](apps/worker/README.md)
for app-specific details.
