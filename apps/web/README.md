# @vgl/web

Vite + React + TypeScript build for the Video Game Library web app.

## Dev

```sh
pnpm --filter @vgl/web dev
```

Serves at `http://localhost:5173`.

## Build

```sh
pnpm --filter @vgl/web build
```

Outputs to `apps/web/dist/`.

## Status

Phase 2 in progress. The legacy single-file app at `index.html` (repo root) is still the deployed site; this workspace is being built up alongside it and will replace the root files in the final cutover PR.
