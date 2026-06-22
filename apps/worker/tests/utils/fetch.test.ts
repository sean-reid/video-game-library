import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTextWithAllowlistedRedirects } from '../../src/utils/fetch';

describe('fetchTextWithAllowlistedRedirects', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const allowExample = (u: string): boolean => new URL(u).hostname.endsWith('example.com');

  it('returns the body when the initial URL is allowed and returns 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('payload', { status: 200 })),
    );
    const text = await fetchTextWithAllowlistedRedirects(
      'https://news.example.com/article',
      allowExample,
    );
    expect(text).toBe('payload');
  });

  it('rejects an initial URL that is not allowed', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(
      fetchTextWithAllowlistedRedirects('https://evil.test/article', allowExample),
    ).rejects.toThrow(/not allowed/);
  });

  it('follows an allowed redirect chain', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { Location: 'https://b.example.com/x' } }),
      )
      .mockResolvedValueOnce(new Response('final', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const text = await fetchTextWithAllowlistedRedirects(
      'https://a.example.com/x',
      allowExample,
    );
    expect(text).toBe('final');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses to follow a redirect into a non-allowed host', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: 'https://internal.local/secret' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      fetchTextWithAllowlistedRedirects('https://news.example.com/article', allowExample),
    ).rejects.toThrow(/not allowed: https:\/\/internal\.local\/secret/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caps redirect hops', async () => {
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'https://example.com/loop' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      fetchTextWithAllowlistedRedirects('https://example.com/start', allowExample),
    ).rejects.toThrow(/Too many redirects/);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('throws when the redirect lacks a Location header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 301 })));
    await expect(
      fetchTextWithAllowlistedRedirects('https://news.example.com/x', allowExample),
    ).rejects.toThrow(/without Location/);
  });
});
