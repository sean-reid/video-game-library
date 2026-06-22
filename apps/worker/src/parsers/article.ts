import type { ArticleResponse } from '../types';
import { cleanEntities, extractField, extractMeta } from '../utils/html';

export function parseArticle(html: string, sourceUrl: string): ArticleResponse {
  // `||` rather than `??` is deliberate: an empty-string og:title should
  // still fall through to the <title> tag.
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const title = extractMeta(html, 'og:title') || extractField(html, 'title');
  const byline = extractMeta(html, 'article:author') ?? extractMeta(html, 'author');
  const publishedAt = extractMeta(html, 'article:published_time') ?? extractMeta(html, 'pubdate');
  const heroImage = extractMeta(html, 'og:image') ?? extractMeta(html, 'twitter:image');
  const siteName = extractMeta(html, 'og:site_name');
  const description = extractMeta(html, 'og:description') ?? extractMeta(html, 'description');

  const content = extractArticleContent(html);

  return {
    title: cleanEntities(title),
    byline: byline ? cleanEntities(byline) : null,
    publishedAt: publishedAt ?? null,
    heroImage: heroImage ?? null,
    siteName: siteName ? cleanEntities(siteName) : new URL(sourceUrl).hostname,
    description: description ? cleanEntities(description) : null,
    content,
    sourceUrl,
  };
}

export function extractArticleContent(html: string): string {
  // Try common content containers in order — first match wins.
  const patterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]+class=["'][^"']*(?:c-entry-content|article-content|article__content|article-body|post-content|entry-content|story-content|content-body|article__main|m-detail--body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<section[^>]+class=["'][^"']*(?:article|story)[^"']*["'][^>]*>([\s\S]*?)<\/section>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ];

  let raw: string | null = null;
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) {
      raw = m[1];
      break;
    }
  }
  if (!raw) return '';
  return cleanArticleHtml(raw);
}

export function cleanArticleHtml(html: string): string {
  let s = html;
  // Strip executable / dangerous content
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, '');
  // Strip chrome
  s = s.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  s = s.replace(/<aside[\s\S]*?<\/aside>/gi, '');
  s = s.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  s = s.replace(/<header[\s\S]*?<\/header>/gi, '');
  s = s.replace(/<form[\s\S]*?<\/form>/gi, '');
  // Strip ads / share / related panels by class hint
  s = s.replace(
    /<(div|section|aside)[^>]+class=["'][^"']*(?:ad-|advertisement|share|social|newsletter|related|recommended|sidebar|promo|sponsor|subscribe|signup|comment|disqus|nielsen|connatix)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
    '',
  );
  // Strip iframes except YouTube / Vimeo embeds
  s = s.replace(
    /<iframe[^>]+src=["'](?!https?:\/\/(?:www\.)?(?:youtube|vimeo)\.com)[^"']*["'][^>]*>[\s\S]*?<\/iframe>/gi,
    '',
  );
  // Strip event handlers, tracking attrs, inline styles, classes, IDs
  s = s.replace(/\son\w+=["'][^"']*["']/g, '');
  s = s.replace(/\sdata-[\w-]+=["'][^"']*["']/g, '');
  s = s.replace(/\sstyle=["'][^"']*["']/g, '');
  s = s.replace(/\sclass=["'][^"']*["']/g, '');
  s = s.replace(/\sid=["'][^"']*["']/g, '');
  // Force img src to use https and lazy load
  s = s.replace(/<img\b/gi, '<img loading="lazy"');
  // Collapse whitespace
  s = s.replace(/[ \t\n]+/g, ' ').replace(/>\s+</g, '><');
  return s.trim();
}
