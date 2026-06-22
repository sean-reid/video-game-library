import { describe, expect, it } from 'vitest';
import { parseExpected, upcomingSortKey } from '../../src/utils/dateUtils.js';

describe('parseExpected', () => {
  it('returns TBD for empty / null / undefined', () => {
    expect(parseExpected(null)).toEqual({ sortKey: 9999, label: 'TBD' });
    expect(parseExpected(undefined)).toEqual({ sortKey: 9999, label: 'TBD' });
    expect(parseExpected('')).toEqual({ sortKey: 9999, label: 'TBD' });
  });

  it('handles the "Available" sentinel', () => {
    expect(parseExpected('Available')).toEqual({ sortKey: 0, label: 'Available now' });
  });

  it('parses M/D/YYYY', () => {
    expect(parseExpected('6/15/2026')).toEqual({
      sortKey: 20260615,
      label: 'Jun 15, 2026',
    });
  });

  it('expands 2-digit year', () => {
    expect(parseExpected('6/15/26').sortKey).toBe(20260615);
  });

  it('parses M/D (assumes 2026)', () => {
    expect(parseExpected('6/15')).toEqual({ sortKey: 20260615, label: 'Jun 15, 2026' });
  });

  it('parses "Month YYYY"', () => {
    expect(parseExpected('February 2027')).toEqual({
      sortKey: 20270200,
      label: 'February 2027',
    });
  });

  it('parses seasonal strings', () => {
    expect(parseExpected('Fall 2026').sortKey).toBe(20260900);
    expect(parseExpected('Spring 2026').sortKey).toBe(20260300);
    expect(parseExpected('Summer 2026').sortKey).toBe(20260600);
    expect(parseExpected('Winter 2026').sortKey).toBe(20261200);
  });

  it('parses half-year and quarter', () => {
    expect(parseExpected('H1 2026').sortKey).toBe(20260300);
    expect(parseExpected('H2 2026').sortKey).toBe(20260900);
    expect(parseExpected('Q1 2026').sortKey).toBe(20260200);
    expect(parseExpected('Q4 2026').sortKey).toBe(20261100);
  });

  it('parses year-only', () => {
    expect(parseExpected('2027')).toEqual({ sortKey: 20279999, label: '2027' });
  });

  it('keeps unparseable strings as TBD-priority but preserves the label', () => {
    expect(parseExpected('whenever')).toEqual({ sortKey: 9999, label: 'whenever' });
  });

  it('orders correctly within a year', () => {
    expect(parseExpected('Q1 2026').sortKey).toBeLessThan(parseExpected('Q3 2026').sortKey);
    expect(parseExpected('Spring 2026').sortKey).toBeLessThan(parseExpected('Fall 2026').sortKey);
    expect(parseExpected('H1 2026').sortKey).toBeLessThan(parseExpected('H2 2026').sortKey);
  });
});

describe('upcomingSortKey', () => {
  it('uses parseExpected when the date string is recognised', () => {
    expect(upcomingSortKey({ expectedDate: 'Fall 2026' })).toBe(20260900);
  });

  it('falls back to game.year when the date is unparseable', () => {
    expect(upcomingSortKey({ expectedDate: 'whenever', year: 2028 })).toBe(20289999);
  });

  it('returns TBD sentinel when neither is available', () => {
    expect(upcomingSortKey({})).toBe(9999);
  });
});
