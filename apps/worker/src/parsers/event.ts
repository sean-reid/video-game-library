import { stripTags } from '../utils/html';

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function extractDateFromText(text: string, contextDate: Date): Date | null {
  const monthRe =
    '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)';
  // "June 2, 2026", "Jun 2 2026", "June 2nd", "2nd of June"
  let m = new RegExp(`\\b${monthRe}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, 'i').exec(
    text,
  );
  m ??= new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${monthRe}(?:,?\\s*(\\d{4}))?\\b`,
    'i',
  ).exec(text);
  if (!m?.[1] || !m[2]) return null;

  let monthName: string;
  let day: number;
  let year: number | null;
  if (MONTHS[m[1].toLowerCase()] !== undefined) {
    monthName = m[1];
    day = parseInt(m[2], 10);
    year = m[3] ? parseInt(m[3], 10) : null;
  } else {
    day = parseInt(m[1], 10);
    monthName = m[2];
    year = m[3] ? parseInt(m[3], 10) : null;
  }
  const month = MONTHS[monthName.toLowerCase()];
  if (month === undefined || !day) return null;

  if (!year) {
    // Anchor to the article's publish date when available — "June 2" in an
    // article published May 20, 2026 almost certainly means June 2, 2026,
    // even if the Worker's wall clock is in a different year.
    const anchorYear = contextDate.getFullYear();
    const candidate = new Date(anchorYear, month, day);
    // If the candidate is well before the anchor, the event is next year.
    year =
      candidate.getTime() < contextDate.getTime() - 30 * 86_400_000 ? anchorYear + 1 : anchorYear;
  }

  return new Date(year, month, day);
}

export function extractTimeFromText(text: string): string | null {
  return extractTimeFromCell(text) || null;
}

// Permissive time extractor — handles "5:00 PM EDT", "17:00 UTC",
// "5 p.m.", "2 PM Pacific". Returns the full matched substring.
export function extractTimeFromCell(cell: string): string {
  // 1) HH:MM with optional am/pm and timezone — e.g. "5:00 PM EDT", "17:00 UTC"
  let m =
    /\b(\d{1,2}):(\d{2})\s*(?:(am|pm|a\.m\.|p\.m\.)\s*)?(?:\(?\s*(UTC|GMT|EST|EDT|PST|PDT|CST|CDT|MST|MDT|ET|PT|CT|MT|JST|CET|Pacific|Eastern|Central|Mountain)\s*\)?)?/i.exec(
      cell,
    );
  if (m) return m[0].trim();
  // 2) Hour with am/pm (no minutes) — e.g. "2 PM Pacific"
  m =
    /\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)\s*(?:\(?\s*(UTC|GMT|EST|EDT|PST|PDT|CST|CDT|MST|MDT|ET|PT|CT|MT|JST|CET|Pacific|Eastern|Central|Mountain)\s*\)?)?/i.exec(
      cell,
    );
  if (m) return m[0].trim();
  return '';
}

export function parseEventDate(s: string): Date | null {
  if (!s) return null;
  const cleaned = String(s)
    .replace(/\[\d+\]/g, '')
    .trim();

  // Try native Date parse first ("June 2, 2026", "2 June 2026", "2026-06-02")
  const native = new Date(cleaned);
  if (!isNaN(native.getTime()) && native.getFullYear() > 2000 && native.getFullYear() < 2100) {
    return native;
  }

  // "June 2, 2026" / "Jun 2 2026"
  const monthDayYear =
    /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2}),?\s+(\d{4})/i.exec(
      cleaned,
    );
  if (monthDayYear?.[1] && monthDayYear[2] && monthDayYear[3]) {
    const m = MONTHS[monthDayYear[1].toLowerCase()];
    if (m !== undefined) {
      return new Date(parseInt(monthDayYear[3], 10), m, parseInt(monthDayYear[2], 10));
    }
  }

  return null;
}

export function extractWikipediaUpcoming(html: string): { date: string; time: string } | null {
  const now = Date.now();
  const candidates: { date: string; time: string; ts: number }[] = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)) {
    const cells = [...rowMatch[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)]
      .map((m) =>
        stripTags(m[1] ?? '')
          .replace(/\[\d+\]/g, '')
          .trim(),
      )
      .filter(Boolean);
    if (cells.length === 0) continue;

    let dateCell = '';
    let dateTs = 0;
    let timeCell = '';
    for (const cell of cells) {
      if (!dateCell) {
        const parsed = parseEventDate(cell);
        if (parsed && parsed.getTime() > now - 86_400_000) {
          dateCell = cell;
          dateTs = parsed.getTime();
        }
      }
      if (!timeCell) {
        const t = extractTimeFromCell(cell);
        if (t) timeCell = t;
      }
    }
    if (dateCell && dateTs > now - 86_400_000) {
      candidates.push({ date: dateCell, time: timeCell || 'TBA', ts: dateTs });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.ts - b.ts);
  const first = candidates[0];
  if (!first) return null;
  return { date: first.date, time: first.time };
}
