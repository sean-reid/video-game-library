import { describe, expect, it } from 'vitest';
import { allowedOrigins, isDebug } from '../src/env';

describe('isDebug', () => {
  it('is true when DEBUG is exactly "true"', () => {
    expect(isDebug({ RAWG_API_KEY: 'x', DEBUG: 'true' })).toBe(true);
  });

  it('is false when DEBUG is "false"', () => {
    expect(isDebug({ RAWG_API_KEY: 'x', DEBUG: 'false' })).toBe(false);
  });

  it('is false when DEBUG is missing', () => {
    expect(isDebug({ RAWG_API_KEY: 'x' })).toBe(false);
  });

  it('does not treat truthy non-"true" strings as debug', () => {
    expect(isDebug({ RAWG_API_KEY: 'x', DEBUG: '1' })).toBe(false);
    expect(isDebug({ RAWG_API_KEY: 'x', DEBUG: 'yes' })).toBe(false);
  });
});

describe('allowedOrigins', () => {
  it('includes localhost in dev defaults when DEBUG=true and ALLOWED_ORIGINS unset', () => {
    const origins = allowedOrigins({ RAWG_API_KEY: 'x', DEBUG: 'true' });
    expect(origins).toContain('https://danrstaton.github.io');
    expect(origins).toContain('http://localhost:5173');
  });

  it('omits localhost in prod when ALLOWED_ORIGINS unset', () => {
    const origins = allowedOrigins({ RAWG_API_KEY: 'x' });
    expect(origins).toContain('https://danrstaton.github.io');
    expect(origins).not.toContain('http://localhost:5173');
  });

  it('parses a comma-separated env var into trimmed origins', () => {
    expect(
      allowedOrigins({ RAWG_API_KEY: 'x', ALLOWED_ORIGINS: 'https://a, https://b ,  https://c' }),
    ).toEqual(['https://a', 'https://b', 'https://c']);
  });

  it('drops empty entries from the env var', () => {
    expect(allowedOrigins({ RAWG_API_KEY: 'x', ALLOWED_ORIGINS: 'https://a,,  ,' })).toEqual([
      'https://a',
    ]);
  });
});
