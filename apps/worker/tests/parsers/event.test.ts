import { describe, expect, it } from 'vitest';
import {
  extractDateFromText,
  extractTimeFromCell,
  extractTimeFromText,
  extractWikipediaUpcoming,
  parseEventDate,
} from '../../src/parsers/event';

describe('extractDateFromText', () => {
  const ctx = new Date('2026-05-20T00:00:00Z');

  it('parses "June 2, 2026"', () => {
    const d = extractDateFromText('Sony State of Play happens June 2, 2026', ctx);
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(5);
    expect(d?.getDate()).toBe(2);
  });

  it('parses "Jun 2 2026" without comma', () => {
    expect(extractDateFromText('Jun 2 2026', ctx)?.getMonth()).toBe(5);
  });

  it('parses ordinal-day-with-of forms ("2nd of June")', () => {
    const d = extractDateFromText('happening on the 2nd of June', ctx);
    expect(d?.getMonth()).toBe(5);
    expect(d?.getDate()).toBe(2);
  });

  it('infers year from context when omitted', () => {
    const d = extractDateFromText('coming June 2', ctx);
    expect(d?.getFullYear()).toBe(2026);
  });

  it('rolls year forward when bare month-day is well before context', () => {
    const lateCtx = new Date('2026-12-15T00:00:00Z');
    const d = extractDateFromText('coming January 5', lateCtx);
    expect(d?.getFullYear()).toBe(2027);
  });

  it('returns null when no date is found', () => {
    expect(extractDateFromText('no dates here', ctx)).toBeNull();
  });
});

describe('extractTimeFromCell + extractTimeFromText', () => {
  it('matches HH:MM with am/pm + tz', () => {
    expect(extractTimeFromCell('5:00 PM EDT')).toBe('5:00 PM EDT');
    expect(extractTimeFromText('starts at 5:00 PM EDT sharp')).toBe('5:00 PM EDT');
  });

  it('matches 24h with timezone', () => {
    expect(extractTimeFromCell('17:00 UTC')).toBe('17:00 UTC');
  });

  it('matches hour-only with am/pm', () => {
    expect(extractTimeFromCell('2 PM Pacific')).toBe('2 PM Pacific');
  });

  it('returns empty string when no time is present', () => {
    expect(extractTimeFromCell('no time here')).toBe('');
    expect(extractTimeFromText('no time here')).toBeNull();
  });
});

describe('parseEventDate', () => {
  it('strips Wikipedia footnote markers before parsing', () => {
    const d = parseEventDate('June 2, 2026[1]');
    expect(d?.getMonth()).toBe(5);
    expect(d?.getDate()).toBe(2);
  });

  it('parses ISO 8601 via native Date', () => {
    expect(parseEventDate('2026-06-02')?.getFullYear()).toBe(2026);
  });

  it('parses "Jun 2 2026"', () => {
    expect(parseEventDate('Jun 2 2026')?.getMonth()).toBe(5);
  });

  it('returns null when the native parse falls outside 2001-2099 and the regex does not match', () => {
    // Year out of band and not a month-day-year regex match.
    expect(parseEventDate('xyz not a real date 1850')).toBeNull();
  });

  it('returns null for nullish input', () => {
    expect(parseEventDate('')).toBeNull();
  });
});

describe('extractWikipediaUpcoming', () => {
  it('returns soonest future row', () => {
    const future = new Date(Date.now() + 30 * 86_400_000);
    const futureStr = future.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const html = `
      <table>
        <tr><td>${futureStr}</td><td>5:00 PM EDT</td></tr>
        <tr><td>January 1, 1999</td><td>2 PM Pacific</td></tr>
      </table>
    `;
    expect(extractWikipediaUpcoming(html)).toEqual({ date: futureStr, time: '5:00 PM EDT' });
  });

  it('returns null when no future rows', () => {
    expect(extractWikipediaUpcoming('<table><tr><td>January 1, 1999</td></tr></table>')).toBeNull();
  });

  it('defaults time to "TBA" when only the date cell is present', () => {
    const future = new Date(Date.now() + 14 * 86_400_000);
    const futureStr = future.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const html = `<table><tr><td>${futureStr}</td><td></td></tr></table>`;
    expect(extractWikipediaUpcoming(html)).toEqual({ date: futureStr, time: 'TBA' });
  });
});
