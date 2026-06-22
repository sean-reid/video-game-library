import { ARTICLE_CACHE_TTL_SECONDS, CACHE_TTL_SECONDS } from './config';
import type { Env } from './env';
import { buildNewsBundle } from './news-bundle';
import { parseArticle } from './parsers/article';
import { fetchText } from './utils/fetch';
import { jsonResponse } from './utils/http';

export async function getNews(
  env: Env,
  ctx: ExecutionContext,
  forceFresh: boolean,
): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.vgl/news-v1');

  if (!forceFresh) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const cachedAt = parseInt(hit.headers.get('X-Cached-At') ?? '0', 10);
      if (Date.now() - cachedAt < CACHE_TTL_SECONDS * 1000) return hit;
    }
  }

  const bundle = await buildNewsBundle(env);
  const response = jsonResponse(bundle);
  response.headers.set('X-Cached-At', String(Date.now()));
  response.headers.set('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}`);
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export async function getArticleCached(
  articleUrl: string,
  ctx: ExecutionContext,
): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request(
    `https://cache.vgl/article-v1?url=${encodeURIComponent(articleUrl)}`,
  );
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const html = await fetchText(articleUrl);
    const article = parseArticle(html, articleUrl);
    const response = jsonResponse(article);
    response.headers.set('Cache-Control', `public, max-age=${ARTICLE_CACHE_TTL_SECONDS}`);
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (e) {
    return jsonResponse({ error: String(e), sourceUrl: articleUrl });
  }
}
