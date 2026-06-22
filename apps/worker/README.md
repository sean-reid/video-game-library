# @vgl/worker

Cloudflare Worker that aggregates RSS feeds, YouTube channel uploads, and
Wikipedia event listings into a single `/news` JSON endpoint, parses article
HTML at `/article?url=...`, and proxies RAWG at `/rawg/*` so the API key
never reaches the client.

## Endpoints

| Path | Purpose |
| --- | --- |
| `GET /news` | Aggregated news bundle (headlines + podcasts + events). 5-minute edge cache. |
| `GET /article?url=...` | Parsed article body. URL must match `ARTICLE_ALLOWED_HOSTS`; redirects are re-validated against the same allowlist (SSRF guard). |
| `GET /rawg/*` | Server-keyed RAWG proxy. Paths and query params allowlisted. |
| `OPTIONS /*` | CORS preflight. |

## Environments

Two Wrangler environments, one per Cloudflare account:

| Env | URL pattern | Account |
| --- | --- | --- |
| `dev` | `https://vgl-news-dev.<account>.workers.dev` | Your dev account |
| `prod` | `https://vgl-news.<codeowner>.workers.dev` | Codeowner |

Override CORS origins with `ALLOWED_ORIGINS` (comma-separated). When unset
the dev env (`DEBUG=true`) returns the Pages origins + localhost; prod
returns only the Pages origins so a rogue dev tool can't poke the API.

## Local dev

```sh
pnpm --filter @vgl/worker dev                  # wrangler dev --env dev
```

One-time setup: drop a `.dev.vars` (gitignored) with the RAWG key:

```
RAWG_API_KEY=<your-rawg-key>
```

A `.dev.vars.example` ships in the repo as a template.

## Deploy

Dev (your account):

```sh
wrangler login                                 # one-time
wrangler secret put RAWG_API_KEY --env dev     # one-time
pnpm --filter @vgl/worker deploy:dev
```

Prod is deployed automatically by `.github/workflows/deploy.yml` on every
push to `main`. The codeowner runs once at cutover:

```sh
wrangler secret put RAWG_API_KEY --env prod
```

and adds `CLOUDFLARE_API_TOKEN` (scope: "Edit Cloudflare Workers") to the
repo's Actions secrets.

## Test

```sh
pnpm --filter @vgl/worker test
```

Uses `@cloudflare/vitest-pool-workers` so tests run inside the actual
Workers runtime. 126 tests across parsers, sources, proxies, cache, env,
and SSRF redirect handling.
