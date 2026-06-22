import { describe, expect, it } from 'vitest';
import { corsHeaders, jsonResponse } from '../../src/utils/http';

describe('corsHeaders', () => {
  it('emits the wildcard origin and GET/OPTIONS methods', () => {
    expect(corsHeaders()).toEqual({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
  });
});

describe('jsonResponse', () => {
  it('serialises the payload and attaches CORS + JSON content type', async () => {
    const response = jsonResponse({ ok: true });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await response.json()).toEqual({ ok: true });
  });

  it('honors a custom status from ResponseInit', () => {
    const response = jsonResponse({ error: 'nope' }, { status: 502 });
    expect(response.status).toBe(502);
  });

  it('lets caller-supplied headers override CORS defaults', () => {
    const response = jsonResponse(
      { ok: true },
      { headers: { 'Access-Control-Allow-Origin': 'https://example.com' } },
    );
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
  });
});
