import { RAWG_BASE, RAWG_CACHE_TTL_SECONDS } from '../config';
import type { Env } from '../env';
import { jsonResponse } from '../utils/http';

// Allowlist of RAWG endpoints we forward. Keeps the proxy from being abused
// as an arbitrary api.rawg.io tunnel.
const ALLOWED_PATHS = [
  /^\/games$/,
  /^\/games\/[\w-]+$/,
  /^\/games\/[\w-]+\/screenshots$/,
  /^\/genres$/,
  /^\/platforms$/,
  /^\/developers$/,
  /^\/publishers$/,
];

// Allowlist of query params we forward. Anything else gets dropped before we
// hit RAWG, so a client can't pivot the edge cache or invent novel keys that
// burn through RAWG's per-key quota.
const ALLOWED_PARAMS = new Set([
  'search',
  'search_exact',
  'search_precise',
  'page',
  'page_size',
  'dates',
  'platforms',
  'genres',
  'developers',
  'publishers',
  'ordering',
  'metacritic',
  'tags',
  'stores',
  'parent_platforms',
]);

export function isRawgPath(pathname: string): boolean {
  return pathname === '/rawg' || pathname.startsWith('/rawg/');
}

export async function handleRawg(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!env.RAWG_API_KEY) {
    return jsonResponse({ error: 'RAWG_API_KEY not configured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const upstreamPath = url.pathname.replace(/^\/rawg/, '') || '/';
  if (!ALLOWED_PATHS.some((re) => re.test(upstreamPath))) {
    return jsonResponse({ error: 'Path not allowed' }, { status: 404 });
  }

  // Filter query params before hashing into the cache key so unknown keys
  // can't pivot cache buckets, and so the upstream URL only carries params
  // RAWG actually understands.
  const safeParams = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (ALLOWED_PARAMS.has(k)) safeParams.append(k, v);
  }
  const safeQuery = safeParams.toString();

  // Cache key excludes the API key so identical client queries hit the same
  // edge entry. Use a stable host so the cache survives across worker URLs.
  const cacheKey = new Request(
    `https://cache.vgl/rawg-v1${upstreamPath}${safeQuery ? `?${safeQuery}` : ''}`,
  );
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Forward to RAWG with the key injected server-side.
  const upstreamUrl = new URL(`${RAWG_BASE}${upstreamPath}`);
  for (const [k, v] of safeParams) upstreamUrl.searchParams.append(k, v);
  upstreamUrl.searchParams.set('key', env.RAWG_API_KEY);

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      headers: { 'User-Agent': 'VGL-News-Worker/1.0' },
    });
    if (!upstream.ok) {
      return jsonResponse(
        { error: `RAWG returned ${String(upstream.status)}` },
        { status: upstream.status },
      );
    }
    const body: unknown = await upstream.json();
    const response = jsonResponse(body);
    response.headers.set('Cache-Control', `public, max-age=${RAWG_CACHE_TTL_SECONDS}`);
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (e) {
    return jsonResponse({ error: String(e) }, { status: 502 });
  }
}
