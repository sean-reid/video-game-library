import { WIKIPEDIA_EVENT_SOURCES } from '../config';
import {
  extractDateFromText,
  extractTimeFromText,
  extractWikipediaUpcoming,
  parseEventDate,
} from '../parsers/event';
import type { EventItem, EventType, Headline } from '../types';
import { fetchText } from '../utils/fetch';

export async function fetchAllEvents(headlines: Headline[]): Promise<EventItem[]> {
  // 1) Try Wikipedia (works once the page is updated, but they're slow).
  const wikiEvents = await Promise.all(
    WIKIPEDIA_EVENT_SOURCES.map(async (ev): Promise<EventItem | null> => {
      try {
        const html = await fetchText(ev.url);
        const upcoming = extractWikipediaUpcoming(html);
        if (!upcoming) return null;
        const parsedDate = parseEventDate(upcoming.date);
        const dateSlug = parsedDate
          ? parsedDate.toISOString().slice(0, 10)
          : upcoming.date
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '');
        return {
          id: `${ev.type}-${dateSlug}`,
          type: ev.type,
          title: ev.title,
          date: upcoming.date,
          time: upcoming.time,
          accent: ev.accent,
          _source: 'wikipedia',
        };
      } catch {
        return null;
      }
    }),
  );

  // 2) Scan recent headlines for event announcements — catches fresh news
  //    Wikipedia hasn't logged yet (announcements come hours/days before).
  const headlineEvents = extractEventsFromHeadlines(headlines);

  // 3) Merge + dedupe by type+date.
  return dedupeEvents([...wikiEvents.filter((e): e is EventItem => e !== null), ...headlineEvents]);
}

export function dedupeEvents(events: EventItem[]): EventItem[] {
  const seen = new Map<string, EventItem>();
  for (const ev of events) {
    // Loose key — same type within a few days = same event
    const ts = parseEventDate(ev.date)?.getTime();
    const dayKey = ts !== undefined ? Math.floor(ts / 86400000) : ev.date;
    const key = `${ev.type}-${String(dayKey)}`;
    if (!seen.has(key)) seen.set(key, ev);
  }
  return [...seen.values()];
}

export function extractEventsFromHeadlines(headlines: Headline[]): EventItem[] {
  const events: EventItem[] = [];
  for (const h of headlines) {
    const text = `${h.title} ${h.excerpt}`;
    const titleOnly = h.title;

    const isStateOfPlay = /state of play/i.test(text);
    // Exclude past-coverage headlines — check title only to avoid catching
    // an excerpt that mentions "highlights from previous shows" in a
    // forward-looking announcement.
    const isPastCoverage =
      /\b(recap|everything announced|highlights|round-?up|here's what|takeaways|reaction|aftermath|takeaway)\b/i.test(
        titleOnly,
      );
    const isNintendoDirect = /nintendo direct/i.test(text);

    if (!(isStateOfPlay || isNintendoDirect)) continue;
    if (isPastCoverage) continue;

    // Use the article's publish date as the year context: "June 2" in a
    // May 2026 article is overwhelmingly likely to mean June 2, 2026.
    const contextDate = h.publishedAt ? new Date(h.publishedAt) : new Date();
    const parsed = extractDateFromText(text, contextDate);
    if (!parsed) continue;

    const ts = parsed.getTime();
    const contextTs = contextDate.getTime();
    // Skip if the event is well before the article was written (probably a
    // reference to a past event) or far past the cache window.
    if (ts < contextTs - 7 * 86_400_000) continue;
    if (ts > contextTs + 120 * 86_400_000) continue;

    const type: EventType = isStateOfPlay ? 'playstation' : 'nintendo';
    const title = isStateOfPlay ? 'Sony State of Play' : 'Nintendo Direct';
    const accent = isStateOfPlay ? '#3b82f6' : '#dc2626';

    events.push({
      id: `${type}-${parsed.toISOString().slice(0, 10)}`,
      type,
      title,
      date: parsed.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      time: extractTimeFromText(text) ?? 'TBA',
      accent,
      _source: 'headlines',
      _from: h.source,
      _matchedTitle: h.title,
    });
  }
  return events;
}
