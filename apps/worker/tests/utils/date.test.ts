import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/utils/date';

describe('parseDate', () => {
  it('round-trips an ISO string', () => {
    expect(parseDate('2026-06-02T17:00:00.000Z')).toBe('2026-06-02T17:00:00.000Z');
  });

  it('normalizes an RFC 2822 date to ISO', () => {
    expect(parseDate('Mon, 02 Jun 2026 17:00:00 GMT')).toBe('2026-06-02T17:00:00.000Z');
  });

  it('returns the current time for empty input', () => {
    const before = Date.now();
    const result = new Date(parseDate('')).getTime();
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after + 1);
  });

  it('returns the current time for an unparseable string', () => {
    const before = Date.now();
    const result = new Date(parseDate('not a date')).getTime();
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after + 1);
  });
});
