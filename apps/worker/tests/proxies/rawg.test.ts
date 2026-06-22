import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/env';
import { handleRawg, isRawgPath } from '../../src/proxies/rawg';

const env: Env = { RAWG_API_KEY: 'test-key', DEBUG: 'false' };

const pending: Promise<unknown>[] = [];
const ctx = {
  waitUntil(p: Promise<unknown>) {
    pending.push(p);
  },
  passThroughOnException() {
    /* noop */
  },
  props: {},
} as unknown as ExecutionContext;

async function flushWaitUntil(): Promise<void> {
  await Promise.allSettled(pending.splice(0));
}

describe('isRawgPath', () => {
  it('matches /rawg and /rawg/...', () => {
    expect(isRawgPath('/rawg')).toBe(true);
    expect(isRawgPath('/rawg/games')).toBe(true);
    expect(isRawgPath('/rawg/games/123')).toBe(true);
  });

  it('rejects unrelated paths', () => {
    expect(isRawgPath('/news')).toBe(false);
    expect(isRawgPath('/article')).toBe(false);
    expect(isRawgPath('/rawgish')).toBe(false);
  });
});

describe('handleRawg', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(async () => {
    await flushWaitUntil();
    globalThis.fetch = originalFetch;
  });

  it('returns 500 when RAWG_API_KEY is unset', async () => {
    const noKey: Env = { RAWG_API_KEY: '' };
    const res = await handleRawg(new Request('https://w.dev/rawg/games'), noKey, ctx);
    expect(res.status).toBe(500);
  });

  it('rejects paths outside the allowlist', async () => {
    const res = await handleRawg(new Request('https://w.dev/rawg/users/me'), env, ctx);
    expect(res.status).toBe(404);
  });

  it('forwards to RAWG with the key injected and strips a client-supplied key', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    const res = await handleRawg(
      new Request('https://w.dev/rawg/games?search=zelda&key=client-key'),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    const called = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    const parsed = new URL(called);
    expect(parsed.searchParams.get('key')).toBe('test-key');
    expect(parsed.searchParams.get('search')).toBe('zelda');
    expect(parsed.pathname).toBe('/api/games');
  });

  it('forwards a specific game by id', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'god-of-war' }), { status: 200 }),
    );
    const res = await handleRawg(new Request('https://w.dev/rawg/games/god-of-war'), env, ctx);
    expect(res.status).toBe(200);
    const called = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(new URL(called).pathname).toBe('/api/games/god-of-war');
  });

  it('propagates upstream errors with the original status', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('Forbidden', { status: 403 }),
    );
    const res = await handleRawg(new Request('https://w.dev/rawg/games'), env, ctx);
    expect(res.status).toBe(403);
  });

  it('returns 502 when fetch throws', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'));
    const res = await handleRawg(new Request('https://w.dev/rawg/games'), env, ctx);
    expect(res.status).toBe(502);
  });

  it('attaches long-cache headers on success', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const res = await handleRawg(new Request('https://w.dev/rawg/games'), env, ctx);
    expect(res.headers.get('Cache-Control')).toContain('max-age=604800');
  });
});
