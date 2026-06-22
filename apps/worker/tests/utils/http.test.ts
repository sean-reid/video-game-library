import { describe, expect, it } from 'vitest';
import { applyCorsOrigin, corsHeaders, jsonResponse } from '../../src/utils/http';

describe('corsHeaders', () => {
  it('emits allow-methods + allow-headers + Vary but no allow-origin', () => {
    expect(corsHeaders()).toEqual({
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    });
  });
});

describe('jsonResponse', () => {
  it('serialises the payload and attaches CORS + JSON content type', async () => {
    const response = jsonResponse({ ok: true });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    // No Access-Control-Allow-Origin by default — applyCorsOrigin adds it per request.
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    expect(response.headers.get('Vary')).toBe('Origin');
    expect(await response.json()).toEqual({ ok: true });
  });

  it('honors a custom status from ResponseInit', () => {
    const response = jsonResponse({ error: 'nope' }, { status: 502 });
    expect(response.status).toBe(502);
  });

  it('lets caller-supplied headers override defaults', () => {
    const response = jsonResponse({ ok: true }, { headers: { Vary: 'Custom' } });
    expect(response.headers.get('Vary')).toBe('Custom');
  });
});

describe('applyCorsOrigin', () => {
  const allowed = ['https://danrstaton.github.io', 'http://localhost:5173'];

  it('echoes the request origin when it is in the allowlist', () => {
    const response = applyCorsOrigin(jsonResponse({}), 'https://danrstaton.github.io', allowed);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://danrstaton.github.io',
    );
  });

  it('omits the header when the origin is not allowed', () => {
    const response = applyCorsOrigin(jsonResponse({}), 'https://evil.example', allowed);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('omits the header when no origin is present', () => {
    const response = applyCorsOrigin(jsonResponse({}), null, allowed);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
