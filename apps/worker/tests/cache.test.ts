import { describe, expect, it } from 'vitest';
import { isAllowedArticleUrl } from '../src/cache';

describe('isAllowedArticleUrl', () => {
  it('accepts allowlisted news hosts', () => {
    expect(isAllowedArticleUrl('https://www.polygon.com/news/post')).toBe(true);
    expect(isAllowedArticleUrl('https://blog.playstation.com/2026/06/02/x')).toBe(true);
    expect(isAllowedArticleUrl('https://www.ign.com/articles/x')).toBe(true);
  });

  it('accepts http and https', () => {
    expect(isAllowedArticleUrl('http://www.polygon.com/x')).toBe(true);
  });

  it('rejects non-allowlisted hosts', () => {
    expect(isAllowedArticleUrl('https://evil.example/x')).toBe(false);
    expect(isAllowedArticleUrl('https://localhost/internal')).toBe(false);
    expect(isAllowedArticleUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
  });

  it('rejects non-http(s) schemes', () => {
    expect(isAllowedArticleUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedArticleUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedArticleUrl('data:text/html,evil')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isAllowedArticleUrl('not a url')).toBe(false);
    expect(isAllowedArticleUrl('')).toBe(false);
  });
});
