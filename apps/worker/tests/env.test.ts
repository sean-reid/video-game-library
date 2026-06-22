import { describe, expect, it } from 'vitest';
import { isDebug } from '../src/env';

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
