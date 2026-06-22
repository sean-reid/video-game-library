// =============================================================================
// VGL News Worker
// -----------------------------------------------------------------------------
// Aggregates RSS feeds, YouTube channel uploads, and Wikipedia event listings
// into a single JSON endpoint for the Video Game Library app.
// Caches at Cloudflare's edge for 30 minutes so most calls are instant.
//
// Endpoints:
//   GET /        — health check
//   GET /news    — { fetchedAt, headlines, podcasts, events }
//   GET /news?nocache=1 — force a fresh fetch (skip edge cache)
//   GET /article?url=... — fetch and extract article body for in-app reader
//   GET /debug   — diagnostics for State of Play / Direct detection
// =============================================================================

import { getArticleCached, getNews } from './cache';
import type { Env } from './env';
import { handleRawg, isRawgPath } from './proxies/rawg';
import { fetchAllEvents } from './sources/events';
import { fetchAllHeadlines } from './sources/headlines';
import { corsHeaders, jsonResponse } from './utils/http';

export type { Env };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === '/' || url.pathname === '') {
      return jsonResponse({ ok: true, app: 'VGL News Worker', version: '1.0.0' });
    }

    if (url.pathname === '/news') {
      const forceFresh = url.searchParams.has('nocache');
      return getNews(env, ctx, forceFresh);
    }

    if (url.pathname === '/article') {
      const articleUrl = url.searchParams.get('url');
      if (!articleUrl) {
        return jsonResponse({ error: 'Missing url parameter' });
      }
      return await getArticleCached(articleUrl, ctx);
    }

    if (isRawgPath(url.pathname)) {
      return await handleRawg(request, env, ctx);
    }

    if (url.pathname === '/debug') {
      const headlines = await fetchAllHeadlines();
      const sopHeadlines = headlines.filter((h) => /state of play/i.test(h.title));
      const ndHeadlines = headlines.filter((h) => /nintendo direct/i.test(h.title));
      const events = await fetchAllEvents(headlines);
      return jsonResponse({
        totalHeadlines: headlines.length,
        stateOfPlayMentions: sopHeadlines.map((h) => ({
          source: h.source,
          title: h.title,
          publishedAt: h.publishedAt,
          url: h.url,
        })),
        nintendoDirectMentions: ndHeadlines.map((h) => ({
          source: h.source,
          title: h.title,
          publishedAt: h.publishedAt,
          url: h.url,
        })),
        events,
      });
    }

    return new Response('Not found', { status: 404, headers: corsHeaders() });
  },
} satisfies ExportedHandler<Env>;
