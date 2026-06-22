import { describe, expect, it } from 'vitest';
import { dedupeEvents, extractEventsFromHeadlines } from '../../src/sources/events';
import type { EventItem, Headline } from '../../src/types';

const baseHeadline = (overrides: Partial<Headline>): Headline => ({
  id: 'h1',
  title: '',
  url: 'https://e.com',
  excerpt: '',
  publishedAt: new Date().toISOString(),
  coverImage: null,
  source: 'IGN',
  platforms: ['multi'],
  category: 'news',
  ...overrides,
});

describe('dedupeEvents', () => {
  it('keeps the first event when two share the same type+day', () => {
    const events: EventItem[] = [
      {
        id: 'a',
        type: 'playstation',
        title: 'A',
        date: 'June 2, 2026',
        time: 'TBA',
        accent: '#x',
        _source: 'wikipedia',
      },
      {
        id: 'b',
        type: 'playstation',
        title: 'B',
        date: 'June 2, 2026',
        time: 'TBA',
        accent: '#x',
        _source: 'headlines',
      },
    ];
    const out = dedupeEvents(events);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('a');
  });

  it('keeps events of different types on the same day', () => {
    const events: EventItem[] = [
      {
        id: 'a',
        type: 'playstation',
        title: 'A',
        date: 'June 2, 2026',
        time: 'TBA',
        accent: '#x',
        _source: 'wikipedia',
      },
      {
        id: 'b',
        type: 'nintendo',
        title: 'B',
        date: 'June 2, 2026',
        time: 'TBA',
        accent: '#x',
        _source: 'wikipedia',
      },
    ];
    expect(dedupeEvents(events)).toHaveLength(2);
  });
});

describe('extractEventsFromHeadlines', () => {
  it('extracts a Sony State of Play with explicit date and time', () => {
    const ctx = new Date('2026-05-20T00:00:00Z');
    const headlines = [
      baseHeadline({
        title: 'Sony State of Play happens June 2, 2026 at 5:00 PM EDT',
        publishedAt: ctx.toISOString(),
      }),
    ];
    const events = extractEventsFromHeadlines(headlines);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('playstation');
    expect(events[0]?.time).toBe('5:00 PM EDT');
  });

  it('extracts a Nintendo Direct without a time as TBA', () => {
    const ctx = new Date('2026-05-20T00:00:00Z');
    const headlines = [
      baseHeadline({
        title: 'Nintendo Direct on June 2',
        publishedAt: ctx.toISOString(),
      }),
    ];
    const events = extractEventsFromHeadlines(headlines);
    expect(events[0]?.type).toBe('nintendo');
    expect(events[0]?.time).toBe('TBA');
  });

  it('skips past-coverage headlines', () => {
    const ctx = new Date('2026-05-20T00:00:00Z');
    const headlines = [
      baseHeadline({
        title: 'Everything announced at the Nintendo Direct on June 2',
        publishedAt: ctx.toISOString(),
      }),
    ];
    expect(extractEventsFromHeadlines(headlines)).toEqual([]);
  });

  it('skips events too far in the past or future', () => {
    const ctx = new Date('2026-05-20T00:00:00Z');
    const headlines = [
      baseHeadline({
        title: 'Nintendo Direct on January 2, 2025',
        publishedAt: ctx.toISOString(),
      }),
      baseHeadline({
        title: 'Nintendo Direct on January 2, 2030',
        publishedAt: ctx.toISOString(),
      }),
    ];
    expect(extractEventsFromHeadlines(headlines)).toEqual([]);
  });
});
