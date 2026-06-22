# @vgl/worker

Cloudflare Worker that aggregates RSS feeds, YouTube channel uploads, and Wikipedia event listings into a single JSON endpoint for the web app, and proxies RAWG so the API key never ships to the client.

## Environments

The worker has two Wrangler environments. They deploy to different Cloudflare accounts and serve different URLs:

| Env  | URL                                          | Cloudflare account |
| ---- | -------------------------------------------- | ------------------ |
| dev  | `https://vgl-news-dev.<your>.workers.dev`    | Development        |
| prod | `https://vgl-news.danrstaton.workers.dev`    | Production         |

## Local dev

```sh
pnpm --filter @vgl/worker dev
```

Runs `wrangler dev --env dev`. Set the RAWG key once in `.dev.vars` (gitignored):

```
RAWG_API_KEY=<your-key>
```

## Deploy

Dev (your account):

```sh
wrangler login                                    # one-time
wrangler secret put RAWG_API_KEY --env dev        # one-time
pnpm --filter @vgl/worker deploy:dev
```

Prod (codeowner only):

```sh
wrangler secret put RAWG_API_KEY --env prod
pnpm --filter @vgl/worker deploy:prod
```

## Test

```sh
pnpm --filter @vgl/worker test
```

Uses `@cloudflare/vitest-pool-workers` so tests run inside the actual Workers runtime.
