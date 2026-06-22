import { describe, expect, it } from 'vitest';
import { cleanArticleHtml, extractArticleContent, parseArticle } from '../../src/parsers/article';

describe('extractArticleContent', () => {
  it('picks the first <article> block', () => {
    const html = `<div><article><p>hello</p></article></div>`;
    expect(extractArticleContent(html)).toBe('<p>hello</p>');
  });

  it('falls back to a known content-class div', () => {
    const html = `<div class="article-body"><p>fallback</p></div>`;
    expect(extractArticleContent(html)).toBe('<p>fallback</p>');
  });

  it('returns empty string when no content container matches', () => {
    expect(extractArticleContent('<div>nope</div>')).toBe('');
  });
});

describe('cleanArticleHtml', () => {
  it('strips script and style tags', () => {
    expect(cleanArticleHtml('<p>ok</p><script>alert(1)</script><style>p{}</style>')).toBe(
      '<p>ok</p>',
    );
  });

  it('strips inline event handlers', () => {
    expect(cleanArticleHtml('<a href="x" onclick="evil()">link</a>')).toContain('href="x"');
    expect(cleanArticleHtml('<a href="x" onclick="evil()">link</a>')).not.toContain('onclick');
  });

  it('strips inline styles and class/id attributes', () => {
    const out = cleanArticleHtml('<p style="color:red" class="x" id="y">text</p>');
    expect(out).toBe('<p>text</p>');
  });

  it('forces lazy loading on img tags', () => {
    expect(cleanArticleHtml('<img src="cat.jpg" />')).toContain('loading="lazy"');
  });

  it('removes non-YouTube/Vimeo iframes', () => {
    const evil = cleanArticleHtml('<iframe src="https://evil.example/x"></iframe>');
    expect(evil).toBe('');
    const youtube = cleanArticleHtml('<iframe src="https://www.youtube.com/embed/abc"></iframe>');
    expect(youtube).toContain('youtube.com');
  });

  it('strips share/ad/newsletter container divs', () => {
    const out = cleanArticleHtml(
      '<p>keep</p><div class="newsletter-signup">subscribe</div><p>also keep</p>',
    );
    expect(out).toBe('<p>keep</p><p>also keep</p>');
  });
});

describe('parseArticle', () => {
  it('falls back from og:title to <title>', () => {
    const html = `<head><title>Fallback</title></head><body><article>x</article></body>`;
    expect(parseArticle(html, 'https://e.com').title).toBe('Fallback');
  });

  it('prefers og:title when present', () => {
    const html = `<meta property="og:title" content="OG Title"><title>Fallback</title><article>x</article>`;
    expect(parseArticle(html, 'https://e.com').title).toBe('OG Title');
  });

  it('exposes byline/publishedAt/heroImage when meta tags are present', () => {
    const html = `
      <meta name="article:author" content="Sean Reid">
      <meta property="article:published_time" content="2026-06-02T17:00:00Z">
      <meta property="og:image" content="https://e.com/cover.jpg">
      <article><p>body</p></article>
    `;
    const a = parseArticle(html, 'https://example.com/post');
    expect(a.byline).toBe('Sean Reid');
    expect(a.publishedAt).toBe('2026-06-02T17:00:00Z');
    expect(a.heroImage).toBe('https://e.com/cover.jpg');
    expect(a.sourceUrl).toBe('https://example.com/post');
  });

  it('uses URL hostname as siteName fallback', () => {
    expect(parseArticle('<article>x</article>', 'https://news.example.com/a').siteName).toBe(
      'news.example.com',
    );
  });
});
