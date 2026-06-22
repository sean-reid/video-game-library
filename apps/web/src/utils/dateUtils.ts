import { MONTH_TO_NUM, MONTHS, SEASON_OFFSETS } from '../data/constants.js';
import type { Game } from '../types/index.js';

export interface ExpectedDate {
  sortKey: number;
  label: string;
}

// Parses the free-form `expectedDate` strings the seed uses for upcoming
// games (e.g. "6/15/2026", "February 2027", "Fall 2026", "H1 2026", "Q3 2026",
// "2027", "Available"). Returns a sortable numeric key plus a human label.
export function parseExpected(s: string | null | undefined): ExpectedDate {
  if (!s) return { sortKey: 9999, label: 'TBD' };
  if (s === 'Available') return { sortKey: 0, label: 'Available now' };

  // "M/D/YYYY" or "M/D/YY"
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (mdy?.[1] && mdy[2] && mdy[3]) {
    const m = parseInt(mdy[1], 10);
    const d = parseInt(mdy[2], 10);
    let y = parseInt(mdy[3], 10);
    if (y < 100) y += 2000;
    return {
      sortKey: y * 10000 + m * 100 + d,
      label: `${MONTHS[m - 1] ?? ''} ${String(d)}, ${String(y)}`,
    };
  }

  // "M/D" — assume 2026 for legacy seed compatibility
  const md = /^(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (md?.[1] && md[2]) {
    const m = parseInt(md[1], 10);
    const d = parseInt(md[2], 10);
    return {
      sortKey: 2026 * 10000 + m * 100 + d,
      label: `${MONTHS[m - 1] ?? ''} ${String(d)}, 2026`,
    };
  }

  // "Month DD, YYYY" / "Month DDth, YYYY" / "Mon DD YYYY"
  const mdyName = /^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(s);
  if (mdyName?.[1] && mdyName[2] && mdyName[3]) {
    const m = MONTH_TO_NUM[mdyName[1].toLowerCase()];
    if (m) {
      const d = parseInt(mdyName[2], 10);
      const y = parseInt(mdyName[3], 10);
      return { sortKey: y * 10000 + m * 100 + d, label: s };
    }
  }

  // "Month YYYY" or "Season YYYY" — e.g., "February 2027", "Fall 2026"
  const monthOrSeason = /^([A-Za-z]+)\s+(\d{4})$/.exec(s);
  if (monthOrSeason?.[1] && monthOrSeason[2]) {
    const word = monthOrSeason[1].toLowerCase();
    const y = parseInt(monthOrSeason[2], 10);
    const monthNum = MONTH_TO_NUM[word];
    if (monthNum != null) {
      return { sortKey: y * 10000 + monthNum * 100, label: s };
    }
    const seasonOffset = SEASON_OFFSETS[word];
    if (seasonOffset != null) {
      return { sortKey: y * 10000 + seasonOffset, label: s };
    }
  }

  // "H1 YYYY" / "H2 YYYY"
  const h = /^H(\d)\s+(\d{4})$/.exec(s);
  if (h?.[1] && h[2]) {
    return { sortKey: parseInt(h[2], 10) * 10000 + (h[1] === '1' ? 300 : 900), label: s };
  }

  // "Q1 YYYY" through "Q4 YYYY"
  const q = /^Q([1-4])\s+(\d{4})$/.exec(s);
  if (q?.[1] && q[2]) {
    const qn = parseInt(q[1], 10);
    const y = parseInt(q[2], 10);
    return { sortKey: y * 10000 + ((qn - 1) * 300 + 200), label: s };
  }

  // Year only "YYYY"
  const y = /^(\d{4})$/.exec(s);
  if (y?.[1]) return { sortKey: parseInt(y[1], 10) * 10000 + 9999, label: s };

  return { sortKey: 9999, label: s };
}

// Effective sort key for upcoming games — falls back to game.year when the
// expectedDate string doesn't parse, so a free-form date plus a year still
// lands in the right bucket.
export function upcomingSortKey(game: Pick<Game, 'expectedDate' | 'year'>): number {
  const { sortKey } = parseExpected(game.expectedDate);
  if (sortKey === 9999 && game.year) return game.year * 10000 + 9999;
  return sortKey;
}

// Relative ago label for a recent ISO timestamp (news headlines, etc.).
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${String(mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${String(hrs)}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${String(days)}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Parse a YYYY-MM-DD string as LOCAL midnight (not UTC) so we don't lose a
// day to timezone offsets.
export function parseLocalDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m?.[1] || !m[2] || !m[3]) return new Date(iso);
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

// Short relative-freshness pulse colour for podcast/news dots. Bright green
// for today, gold for yesterday, muted grey for anything older.
export function freshnessPulse(iso: string | null | undefined): string {
  const d = parseLocalDate(iso);
  if (!d) return '#71717a';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.floor((today.getTime() - that.getTime()) / 86400000);
  if (days <= 0) return '#22c55e';
  if (days === 1) return '#e2b878';
  return '#71717a';
}

// "Mon Day" short date for podcast episode rows.
export function shortDate(iso: string | null | undefined): string {
  const d = parseLocalDate(iso);
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// "TODAY" / "YESTERDAY" / "2 DAYS AGO" / "MAY 23" / "UPCOMING".
export function freshnessLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = parseLocalDate(iso);
  if (!d) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.floor((today.getTime() - that.getTime()) / 86400000);
  if (days < 0) return 'UPCOMING';
  if (days === 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  if (days < 7) return `${String(days)} DAYS AGO`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}
