import React from 'react';
import * as ReactDOM from 'react-dom/client';
import {
  DISMISSED_KEY,
  GIST_KEY,
  NEWS_STALE_MS,
  RAWG_BASE,
  RAWG_KEY,
  READ_KEY,
  REC_METACRITIC_FLOOR,
  RECS_KEY,
  RECS_TTL_MS,
  STORAGE_KEY,
  WORKER_BASE,
} from '../data/config.js';
import {
  CATEGORIES,
  MONTH_TO_NUM,
  MONTHS,
  SEASON_OFFSETS,
  STATE_META,
  TIER_COLOR_FOR_LABEL,
} from '../data/constants.js';
import {
  COVER_OVERRIDES,
  DEFAULT_PALETTE,
  PLATFORM_PALETTES,
  PLATFORM_PRIORITY,
  PLATFORM_SHORT,
  RAWG_PLATFORM_IDS,
} from '../data/platforms.js';
import { SEED_GAMES } from '../data/seed.js';

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// =============================================================================
// HELPERS
// =============================================================================

const TIER = (score) => {
  if (score >= 100) return { label: 'Masterpiece', color: '#e2b878' }; // rich gold
  if (score >= 90)  return { label: 'Amazing',     color: '#a8b4c0' }; // cool silver
  if (score >= 80)  return { label: 'Great',       color: '#b87349' }; // warm bronze
  if (score >= 70)  return { label: 'Good',        color: '#5d6770' };
  return { label: 'Mixed', color: '#4a5260' };
};

// Deterministic hash for generative gradients
const hash = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const gradientFor = (game) => {
  const palettes = PLATFORM_PALETTES[game.platform] || DEFAULT_PALETTE;
  const [a, b] = palettes[hash(game.title) % palettes.length];
  const angle = 120 + (hash(game.title) % 80);
  return `linear-gradient(${angle}deg, ${a} 0%, ${b} 100%)`;
};


const parseExpected = (s) => {
  if (!s) return { sortKey: 9999, label: 'TBD' };
  if (s === 'Available') return { sortKey: 0, label: 'Available now' };

  // "M/D/YYYY" or "M/D/YY"
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const m = parseInt(mdy[1], 10), d = parseInt(mdy[2], 10);
    let y = parseInt(mdy[3], 10);
    if (y < 100) y += 2000;
    return { sortKey: y * 10000 + m * 100 + d, label: `${MONTHS[m-1]} ${d}, ${y}` };
  }
  // "M/D" — assume 2026 for legacy seed compatibility
  const md = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (md) {
    const m = parseInt(md[1], 10), d = parseInt(md[2], 10);
    return { sortKey: 2026 * 10000 + m * 100 + d, label: `${MONTHS[m-1]} ${d}, 2026` };
  }

  // "Month DD, YYYY" / "Month DDth, YYYY" / "Mon DD YYYY"
  const mdyName = s.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (mdyName) {
    const m = MONTH_TO_NUM[mdyName[1].toLowerCase()];
    if (m) {
      const d = parseInt(mdyName[2], 10);
      const y = parseInt(mdyName[3], 10);
      return { sortKey: y * 10000 + m * 100 + d, label: s };
    }
  }

  // "Month YYYY" or "Season YYYY" — e.g., "February 2027", "Fall 2026"
  const monthOrSeason = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthOrSeason) {
    const word = monthOrSeason[1].toLowerCase();
    const y = parseInt(monthOrSeason[2], 10);
    if (MONTH_TO_NUM[word] != null) {
      return { sortKey: y * 10000 + MONTH_TO_NUM[word] * 100, label: s };
    }
    if (SEASON_OFFSETS[word] != null) {
      return { sortKey: y * 10000 + SEASON_OFFSETS[word], label: s };
    }
  }

  // "H1 YYYY" / "H2 YYYY"
  const h = s.match(/^H(\d)\s+(\d{4})$/);
  if (h) return { sortKey: parseInt(h[2]) * 10000 + (h[1] === '1' ? 300 : 900), label: s };

  // "Q1 YYYY" through "Q4 YYYY"
  const q = s.match(/^Q([1-4])\s+(\d{4})$/);
  if (q) {
    const qn = parseInt(q[1], 10);
    const y = parseInt(q[2], 10);
    return { sortKey: y * 10000 + ((qn - 1) * 300 + 200), label: s };
  }

  // Year only "YYYY"
  const y = s.match(/^(\d{4})$/);
  if (y) return { sortKey: parseInt(y[1]) * 10000 + 9999, label: s };

  return { sortKey: 9999, label: s };
};

// Effective sort key for upcoming games — falls back to game.year when
// the expectedDate string doesn't parse, so a free-form date plus a year
// still lands in the right bucket.
const upcomingSortKey = (game) => {
  const { sortKey } = parseExpected(game.expectedDate);
  if (sortKey === 9999 && game.year) return game.year * 10000 + 9999;
  return sortKey;
};

const loadGames = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return SEED_GAMES;
};
const saveGames = (games) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(games)); } catch (e) {}
};

// Re-rank the Top 50 after any change that could affect ordering:
// - Sort by score desc; within same score, existing rank asc acts as a
//   stable tiebreaker (so manual rank edits stick within their score group).
// - Games whose score has dropped below 80 are removed from the Top 50
//   (their topListRank is cleared). The remaining games get sequential
//   ranks 1, 2, 3, …
// - Tier (Masterpiece / Amazing / Great) is derived from score, so the
//   tier section in the UI shifts automatically — no extra work needed.
const TOP_LIST_FLOOR = 80;
const rerankTop50 = (games) => {
  // First: clear topListRank for games that no longer qualify by score
  const cleaned = games.map(g => {
    if (g.topListRank != null && (g.rating?.total || 0) < TOP_LIST_FLOOR) {
      const { topListRank: _, ...rest } = g;
      return rest;
    }
    return g;
  });
  // Sort surviving Top 50 by score desc, tiebreaker by existing rank asc
  const top50 = cleaned.filter(g => g.topListRank != null);
  top50.sort((a, b) => {
    const scoreDiff = (b.rating?.total || 0) - (a.rating?.total || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (a.topListRank || 9999) - (b.topListRank || 9999);
  });
  const newRanks = new Map();
  top50.forEach((g, i) => newRanks.set(g.id, i + 1));
  return cleaned.map(g =>
    newRanks.has(g.id) ? { ...g, topListRank: newRanks.get(g.id) } : g
  );
};

// =============================================================================
// RAWG INTEGRATION
// NOTE: Key is inline because this is a personal app on public GitHub Pages.
// Worst case if scraped: someone burns your 20k/month free quota → rotate.
// If/when that matters, move behind a Cloudflare Worker.
// =============================================================================
const yearOf = (released) => {
  if (!released) return null;
  const y = parseInt(String(released).slice(0, 4), 10);
  return isNaN(y) ? null : y;
};

// Manual cover overrides for games RAWG mis-matched or that need a better image.
// Applied at READ time, so no re-enrichment of localStorage is required.
// Resolve the effective cover URL — manual override beats RAWG match
const effectiveCover = (game) => COVER_OVERRIDES[game.id]?.coverImage || game.coverImage || null;

// Search RAWG for a game by title, pick best match (closest year if available).
// Rejects matches whose release year is >5 years off from the target year —
// this prevents unannounced sequels like "Star Fox 2026" from matching the
// 1993 SNES Star Fox.
const YEAR_MATCH_TOLERANCE = 5;
const searchRawg = async (title, year) => {
  const q = encodeURIComponent(title);
  const url = `${RAWG_BASE}/games?key=${RAWG_KEY}&search=${q}&page_size=5&search_precise=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RAWG ${res.status}`);
  const data = await res.json();
  if (!data.results?.length) return null;

  let results = [...data.results];
  if (year) {
    results.sort((a, b) => {
      const ay = yearOf(a.released);
      const by = yearOf(b.released);
      const ad = ay ? Math.abs(ay - year) : 999;
      const bd = by ? Math.abs(by - year) : 999;
      return ad - bd;
    });
    const best = results[0];
    const bestYear = yearOf(best.released);
    if (bestYear && Math.abs(bestYear - year) > YEAR_MATCH_TOLERANCE) {
      return null; // too far apart, almost certainly a different game
    }
  }
  return results[0];
};

// Fetch RAWG detail for a single game (developers + publishers are NOT in
// the search response — we need this endpoint to get them).
const fetchRawgDetail = async (rawgId) => {
  const url = `${RAWG_BASE}/games/${rawgId}?key=${RAWG_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RAWG detail ${res.status}`);
  return res.json();
};

// =============================================================================
// RECOMMENDATIONS — "For you" engine
// Builds a taste profile from the library (platforms by score sum, devs/
// publishers by Top 50 presence, genres by score sum) and queries RAWG for
// high-Metacritic candidates that match the profile. Results are cached and
// filtered against owned + dismissed sets at render time.
// =============================================================================
const loadRecs = () => {
  try {
    const raw = localStorage.getItem(RECS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        fetchedAt: parsed.fetchedAt || 0,
        candidates: parsed.candidates || [],
        dismissedIds: parsed.dismissedIds || [],
      };
    }
  } catch {}
  return { fetchedAt: 0, candidates: [], dismissedIds: [] };
};
const saveRecs = (recs) => {
  try { localStorage.setItem(RECS_KEY, JSON.stringify(recs)); } catch {}
};

const topN = (weights, n) =>
  Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);

const buildTasteProfile = (games) => {
  const platformWeights = {};
  const genreWeights = {};
  const developerWeights = {};
  const publisherWeights = {};

  games.forEach(g => {
    const score = g.rating?.total || 0;
    const isTop50 = g.topListRank != null;

    if ((g.state === 'played' || g.state === 'playing') && score > 0) {
      const plat = primaryPlatform(g);
      if (plat) platformWeights[plat] = (platformWeights[plat] || 0) + score;
    }

    if (score > 0 && Array.isArray(g.rawgGenres)) {
      g.rawgGenres.forEach(slug => {
        genreWeights[slug] = (genreWeights[slug] || 0) + score + (isTop50 ? 50 : 0);
      });
    }

    if (Array.isArray(g.rawgDevelopers)) {
      g.rawgDevelopers.forEach(slug => {
        developerWeights[slug] = (developerWeights[slug] || 0) + 1 + (isTop50 ? 3 : 0);
      });
    }
    if (Array.isArray(g.rawgPublishers)) {
      g.rawgPublishers.forEach(slug => {
        publisherWeights[slug] = (publisherWeights[slug] || 0) + 1 + (isTop50 ? 3 : 0);
      });
    }
  });

  return {
    platformWeights, genreWeights, developerWeights, publisherWeights,
    topPlatforms:   topN(platformWeights, 5),
    topGenres:      topN(genreWeights, 4),
    topDevelopers:  topN(developerWeights, 6),
    topPublishers:  topN(publisherWeights, 6),
  };
};

// One-time backfill: Top 50 games need devs/publishers for the profile.
// Pulls /games/{id} detail per game and patches them in. Callers should
// pace this — we await each call before the next.
const enrichTop50Detail = async (games, applyPatch) => {
  const targets = games.filter(g =>
    g.topListRank != null && g.rawgId &&
    (!Array.isArray(g.rawgDevelopers) || !Array.isArray(g.rawgPublishers))
  );
  for (const g of targets) {
    try {
      const detail = await fetchRawgDetail(g.rawgId);
      applyPatch(g.id, {
        rawgDevelopers: (detail.developers || []).map(d => d.slug).filter(Boolean),
        rawgPublishers: (detail.publishers || []).map(p => p.slug).filter(Boolean),
        rawgGenres: (detail.genres || []).map(genre => genre.slug).filter(Boolean),
        rawgMetacritic: detail.metacritic || null,
      });
    } catch (e) {
      console.warn('RAWG detail miss for', g.title, e.message);
    }
    await new Promise(r => setTimeout(r, 80));
  }
  return targets.length;
};

// Normalize a RAWG game record into our compact candidate shape (kept slim
// because we cache it in localStorage).
const candidateFromRawg = (r) => ({
  rawgId: r.id,
  slug: r.slug,
  title: r.name,
  year: yearOf(r.released),
  released: r.released || null,
  coverImage: r.background_image || null,
  platforms: (r.platforms || []).map(p => p.platform?.name).filter(Boolean),
  genres: (r.genres || []).map(genre => genre.slug).filter(Boolean),
  metacritic: r.metacritic || null,
  playtime: r.playtime || null,
});

// Score a candidate against the user's taste profile.
const scoreCandidate = (c, profile) => {
  let s = (c.metacritic || 0) / 5; // Metacritic is the strongest single signal
  c.platforms.forEach(p => {
    const sp = shortPlatform(p);
    if (profile.platformWeights[sp]) s += profile.platformWeights[sp] / 50;
  });
  c.genres.forEach(g => {
    if (profile.genreWeights[g]) s += profile.genreWeights[g] / 50;
  });
  return s;
};

// Query RAWG with a few different filter sets and merge — gives variety
// rather than only Studio X's whole catalog.
const fetchRecommendations = async (profile) => {
  const platformIds = profile.topPlatforms
    .map(p => RAWG_PLATFORM_IDS[p])
    .filter(Boolean)
    .join(',');
  const baseParams = `key=${RAWG_KEY}&metacritic=${REC_METACRITIC_FLOOR},100&page_size=20`
    + (platformIds ? `&platforms=${platformIds}` : '');

  const queries = [];
  if (profile.topDevelopers.length) {
    queries.push(`${RAWG_BASE}/games?${baseParams}&developers=${profile.topDevelopers.join(',')}&ordering=-metacritic`);
  }
  if (profile.topPublishers.length) {
    queries.push(`${RAWG_BASE}/games?${baseParams}&publishers=${profile.topPublishers.join(',')}&ordering=-metacritic`);
  }
  if (profile.topGenres.length) {
    queries.push(`${RAWG_BASE}/games?${baseParams}&genres=${profile.topGenres.join(',')}&ordering=-rating`);
  }
  if (queries.length === 0) return [];

  const buckets = await Promise.all(queries.map(async (url) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data.results || [];
    } catch { return []; }
  }));

  const seen = new Map();
  buckets.flat().forEach(r => { if (!seen.has(r.id)) seen.set(r.id, r); });
  const candidates = [...seen.values()].map(candidateFromRawg);
  candidates.forEach(c => { c._score = scoreCandidate(c, profile); });
  candidates.sort((a, b) => b._score - a._score);
  return candidates.slice(0, 30);
};

// =============================================================================
// ICONS
// =============================================================================
const Icon = ({ name, className = 'w-5 h-5', style, filled }) => {
  const paths = {
    library:  <><rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/><rect x="14" y="17" width="7" height="4" rx="1.5"/></>,
    news:     <><path d="M4 5h13a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2V5z"/><path d="M19 7h1a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2"/><path d="M8 9h7M8 13h7M8 17h4"/></>,
    back:     <path d="M15 6l-6 6 6 6"/>,
    search:   <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    plus:     <><path d="M12 5v14M5 12h14"/></>,
    star:     <path d="m12 3 2.5 6 6.5.5-5 4.5L17.5 21 12 17.5 6.5 21l1.5-7-5-4.5 6.5-.5L12 3z"/>,
    check:    <path d="m5 12 5 5L20 7"/>,
    trophy:   <><path d="M7 4h10v3a5 5 0 0 1-10 0V4z"/><path d="M7 4H4v3a3 3 0 0 0 3 3M17 4h3v3a3 3 0 0 1-3 3M10 14h4v4h-4zM8 21h8"/></>,
    replay:   <><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></>,
    clock:    <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    chevron:  <path d="m6 9 6 6 6-6"/>,
    arrowUp:  <path d="m6 15 6-6 6 6"/>,
    arrowDown:<path d="m6 9 6 6 6-6"/>,
    edit:     <><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></>,
    trash:    <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></>,
    upload:   <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/></>,
    settings: <><path d="M4 6h13M4 12h7M4 18h11"/><circle cx="20" cy="6" r="1.5" fill="currentColor"/><circle cx="14" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="18" r="1.5" fill="currentColor"/></>,
    close:    <path d="M18 6 6 18M6 6l12 12"/>,
    play:     <path d="M5 3l14 9-14 9V3z"/>,
    pause:    <><rect x="6" y="5" width="4" height="14" rx="0.5"/><rect x="14" y="5" width="4" height="14" rx="0.5"/></>,
    // Skip-back / skip-forward 15s: circular arrow + "15" in the middle
    skipBack15: <>
      <path d="M3 12a9 9 0 1 0 3-6.7"/>
      <path d="M3 3v6h6"/>
      <text x="12.5" y="15" fontSize="7" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="Inter">15</text>
    </>,
    skipForward15: <>
      <path d="M21 12a9 9 0 1 1-3-6.7"/>
      <path d="M21 3v6h-6"/>
      <text x="12" y="15" fontSize="7" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="Inter">15</text>
    </>,
  };
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
};

// =============================================================================
// GAME CARD (grid view)
// =============================================================================
// Short date label for Upcoming card badge (e.g. "Jun 25", "Fall '26", "2027", "Now")
const shortDateLabel = (s) => {
  if (!s) return '';
  if (s === 'Available') return 'Now';
  const md = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (md) return `${MONTHS[parseInt(md[1])-1]} ${parseInt(md[2])}`;
  const h1 = s.match(/^H(\d)\s+(\d{4})$/);
  if (h1) return `H${h1[1]} '${h1[2].slice(2)}`;
  const season = s.match(/^(Spring|Summer|Fall|Winter)\s+(\d{4})$/);
  if (season) return `${season[1]} '${season[2].slice(2)}`;
  const y = s.match(/^(\d{4})$/);
  if (y) return y[1];
  return s;
};

const shortPlatform = (name) => PLATFORM_SHORT[name] || name;

const pickBestPlatform = (platforms) => {
  if (!platforms || platforms.length === 0) return '';
  for (const p of PLATFORM_PRIORITY) {
    if (platforms.includes(p)) return p;
  }
  return platforms[0]; // anything else (weird/old/regional)
};

// Resolve a primary platform — user-supplied wins, else best RAWG platform (normalized)
const primaryPlatform = (game) =>
  game.platform || (game.rawgPlatforms && shortPlatform(pickBestPlatform(game.rawgPlatforms))) || '';

// Resolve a display year — user-supplied wins, else parsed from RAWG release
const primaryYear = (game) =>
  game.year || (game.rawgReleased ? parseInt(String(game.rawgReleased).slice(0, 4), 10) : null);

const GameCard = ({ game, onClick }) => {
  const tier = game.rating ? TIER(game.rating.total) : null;
  const isTop50 = game.topListRank != null;
  const cover = effectiveCover(game);
  const hasCover = !!cover;

  // TOP-LEFT state tag (consistent across sections)
  let leftBadge = null;
  if (isTop50) {
    leftBadge = (
      <div className="glass-light rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase" style={{ color: tier.color }}>
        #{game.topListRank}
      </div>
    );
  } else if (game.state === 'playing') {
    leftBadge = (
      <div className="glass-light rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase text-emerald-300">
        Playing
      </div>
    );
  } else if (game.state === 'upcoming' && game.notes) {
    // Insert a bullet after "Pre-ordered " if it isn't already there
    const noteText = game.notes.startsWith('Pre-ordered ') && !game.notes.includes('•')
      ? game.notes.replace('Pre-ordered ', 'Pre-ordered • ')
      : game.notes;
    leftBadge = (
      <div className="glass-light rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide text-zinc-200">
        {noteText}
      </div>
    );
  } else if (game.state === 'recommended') {
    const hrs = game.timeToBeat || game.rawgPlaytime;
    if (hrs) {
      leftBadge = (
        <div className="glass-light rounded-full px-2 py-0.5 text-[10px] font-medium text-zinc-200">
          ~{hrs} hrs
        </div>
      );
    }
  }

  // TOP-RIGHT — currently unused; reserved for future signals
  let rightBadge = null;

  // Bottom meta line — full date for Upcoming, year+platform for others
  const plat = primaryPlatform(game);
  const year = primaryYear(game);
  let metaLine = '';
  if (game.state === 'upcoming') {
    const dateLabel = parseExpected(game.expectedDate).label;
    // Skip the date when the section header already conveys it
    // (Available → "Available now" header; year-only → year header)
    const dateIsRedundant = game.expectedDate === 'Available' || /^\d{4}$/.test(dateLabel);
    metaLine = dateIsRedundant ? plat : [dateLabel, plat].filter(Boolean).join(' · ');
  } else {
    metaLine = [year, plat].filter(Boolean).join(' · ');
  }

  // Playing also gets a HLTB-style playtime line under title
  const showPlaytime = game.state === 'playing' && game.rawgPlaytime;

  return (
    <button
      onClick={onClick}
      className="relative group text-left w-full aspect-[3/4] rounded-2xl overflow-hidden grain"
      style={hasCover ? { background: '#0a0a0c' } : { background: gradientFor(game) }}
    >
      {hasCover && (
        <img src={cover} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      )}
      {hasCover && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/20" />
      )}
      <div className="absolute inset-0 flex flex-col justify-end p-3 gap-1.5">
        {/* Badges hover above the title strip. Left cluster = state/rank badge
            plus gold completion markers (platinum trophy, replayed arrow). */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {leftBadge}
            {game.completion?.platinum && (
              <div className="glass-light rounded-full p-1" title="Platinum">
                <Icon name="trophy" className="w-3 h-3" style={{ color: '#e2b878' }} />
              </div>
            )}
            {game.completion?.replayed && (
              <div className="glass-light rounded-full p-1" title="Replayed">
                <Icon name="replay" className="w-3 h-3" style={{ color: '#e2b878' }} />
              </div>
            )}
          </div>
          {rightBadge || <div />}
        </div>

        <div className="glass rounded-xl px-3 py-2.5">
          <div className="serif text-[17px] leading-[1.1] text-white line-clamp-2">{game.title}</div>
          {showPlaytime && (
            <div className="flex items-center gap-1 mt-1 text-[10px] uppercase tracking-wider text-zinc-300 font-medium">
              <Icon name="clock" className="w-2.5 h-2.5" />
              ~{game.rawgPlaytime} hrs avg
            </div>
          )}
          {(metaLine || game.rating) && (
            <div className="flex items-start justify-between mt-1.5 gap-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-400 font-medium leading-tight">
                {metaLine}
              </div>
              {game.rating && (
                <div className="text-[13px] font-semibold tabular-nums shrink-0" style={{ color: tier.color }}>
                  {game.rating.total}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
};

// =============================================================================
// SECTION NAV (segmented control)
// =============================================================================
const SECTIONS = [
  { id: 'top50',       label: 'Top 50' },
  { id: 'playing',     label: 'Playing' },
  { id: 'upcoming',    label: 'Upcoming' },
  { id: 'rumored',     label: 'Rumored' },
  { id: 'recommended', label: 'Recommended' },
  { id: 'played',      label: 'Played' },
];

const SectionNav = ({ active, onChange, counts }) => {
  const containerRef = useRef(null);
  const activeRef = useRef(null);

  // Scroll active pill into view
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const c = containerRef.current;
      const el = activeRef.current;
      const elLeft = el.offsetLeft;
      const elRight = elLeft + el.offsetWidth;
      const scrollLeft = c.scrollLeft;
      const cWidth = c.clientWidth;
      if (elLeft < scrollLeft + 8) c.scrollTo({ left: elLeft - 16, behavior: 'smooth' });
      else if (elRight > scrollLeft + cWidth - 8) c.scrollTo({ left: elRight - cWidth + 16, behavior: 'smooth' });
    }
  }, [active]);

  return (
    <div className="px-4 pt-2 pb-3">
      <div ref={containerRef} className="glass-light rounded-2xl p-1 flex gap-1 overflow-x-auto no-scrollbar">
        {SECTIONS.map(s => {
          const on = active === s.id;
          return (
            <button
              key={s.id}
              ref={on ? activeRef : null}
              onClick={() => onChange(s.id)}
              className={`shrink-0 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all flex items-center gap-1.5 ${
                on ? 'bg-white text-ink-950' : 'text-zinc-300'
              }`}
            >
              {s.label}
              <span className={`tabular-nums text-[11px] ${on ? 'text-zinc-500' : 'text-zinc-500'}`}>
                {counts[s.id]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// =============================================================================
// LIST VIEW (used by Upcoming, Rumored, Recommended, Played)
// =============================================================================
const ListView = ({ groups, formatRight, formatSubtitle, onSelect, accentColor = '#d4a574' }) => (
  <div className="px-4 space-y-6 pb-32">
    {groups.map(g => (
      <div key={g.key}>
        {g.key !== null && (
          <div className="serif text-[22px] mb-2 px-1" style={{ color: accentColor }}>{g.key}</div>
        )}
        <div className="glass rounded-3xl overflow-hidden divide-y divide-white/5">
          {g.games.map(game => (
            <button
              key={game.id}
              onClick={() => onSelect(game)}
              className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="serif text-[17px] leading-tight truncate">{game.title}</div>
                {formatSubtitle && formatSubtitle(game) && (
                  <div className="text-[12px] text-zinc-500 mt-0.5 truncate">{formatSubtitle(game)}</div>
                )}
              </div>
              {formatRight && (
                <div className="text-right shrink-0">
                  <div className="text-[12px] font-medium" style={{ color: accentColor }}>{formatRight(game)}</div>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    ))}
  </div>
);

// =============================================================================
// SECTION CONTENT
// =============================================================================

// Cover-Flow style horizontal scroller — the card whose LEFT edge sits at
// the row's left edge is the "focused" one (flat, full size). Cards to
// its right are tilted inward and stacked back. Snap-scroll lands each
// card flush with the left.
const COVER_FLOW_LEFT_PAD = 20; // matches px-5 of the section header
const COVER_FLOW_GAP = 8;       // tighter spacing — back cards stack closer

const CoverFlowRow = ({ items, renderItem, idKey = 'id', cardWidth = 168, flowKey }) => {
  const containerRef = useRef(null);
  const cardRefs = useRef({});

  const updateTransforms = () => {
    const container = containerRef.current;
    if (!container) return;
    const focusX = container.scrollLeft + COVER_FLOW_LEFT_PAD;
    Object.entries(cardRefs.current).forEach(([id, el]) => {
      if (!el) return;
      const offset = (el.offsetLeft - focusX) / el.offsetWidth;
      const abs = Math.min(Math.abs(offset), 4);

      // Focused card: NO transform at all + highest z-index + explicit
      // pointer-events so taps definitely go through. Setting transform to ''
      // (empty string) removes the inline value entirely, pulling the card out
      // of any 3D containing block iOS might otherwise hit-test through.
      if (abs < 0.04) {
        el.style.transform = '';
        el.style.opacity = '1';
        el.style.zIndex = '50';
        el.style.pointerEvents = 'auto';
        el.style.position = 'relative';
        return;
      }
      // Non-focused cards stay in 3D space and below
      el.style.position = '';

      const rotateY = Math.max(-55, Math.min(55, -offset * 30));
      const scale = Math.max(0.76, 1 - abs * 0.10);
      const translateZ = -Math.min(140, abs * 45);
      // Keep the immediately-adjacent card at its natural position (breathing
      // room next to the focused card) and aggressively pull cards inward
      // from the 3rd onward so the stack reads tight without a visible gap.
      const pullStart = 1; // no pull until offset exceeds 1
      const pullAmount = Math.max(0, abs - pullStart) * 42;
      const translateX = offset > 0 ? -Math.min(64, pullAmount) : Math.min(64, pullAmount);
      const opacity = Math.max(0.4, 1 - abs * 0.22);
      el.style.transform = `translate3d(${translateX}px, 0, ${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`;
      el.style.opacity = opacity;
      el.style.zIndex = abs < 1.2 ? 20 : 10;
    });
  };

  // Explicitly set the inner flex container's WIDTH so it exceeds the
  // viewport — padding alone doesn't extend scrollWidth in some browsers.
  const innerRef = useRef(null);
  const setRightPadding = () => {
    const c = containerRef.current;
    const inner = innerRef.current;
    if (!c || !inner) return;
    const n = items.length;
    const naturalContent = n * cardWidth + Math.max(0, n - 1) * COVER_FLOW_GAP;
    // Trailing room = clientWidth - cardWidth so the last card can scroll
    // its left edge to focus (the right side becomes empty paddingLeft-style).
    const tail = Math.max(40, c.clientWidth - cardWidth + 40);
    inner.style.width = `${naturalContent + tail}px`;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let rafId = null;
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        updateTransforms();
        rafId = null;
      });
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    setRightPadding();
    // Cards reflow after first padding set; converge in a second pass.
    requestAnimationFrame(() => {
      setRightPadding();
      updateTransforms();
    });
    const ro = new ResizeObserver(() => {
      setRightPadding();
      requestAnimationFrame(updateTransforms);
    });
    ro.observe(container);
    return () => { container.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, [items]);

  return (
    <div
      ref={containerRef}
      data-flowkey={flowKey}
      className="overflow-x-auto no-scrollbar"
      style={{
        scrollSnapType: 'x mandatory',
        scrollBehavior: 'smooth',
        scrollPaddingInlineStart: `${COVER_FLOW_LEFT_PAD}px`,
        paddingLeft: `${COVER_FLOW_LEFT_PAD}px`,
        // paddingRight is set imperatively in setRightPadding()
        paddingTop: '6px',
        paddingBottom: '14px',
        perspective: '1200px',
      }}
    >
      <div ref={innerRef} className="flex items-center" style={{ gap: `${COVER_FLOW_GAP}px` }}>
        {items.map(item => {
          const id = item[idKey];
          return (
            <div
              key={id}
              ref={el => { cardRefs.current[id] = el; }}
              className="shrink-0"
              style={{
                width: `${cardWidth}px`,
                scrollSnapAlign: 'start',
                transition: 'transform 140ms ease-out, opacity 140ms ease-out',
                transformOrigin: 'left center',
                touchAction: 'manipulation',
              }}
            >
              {renderItem(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Top50View = ({ games, onSelect }) => {
  const groups = useMemo(() => {
    const list = games.filter(g => g.topListRank != null).sort((a, b) => a.topListRank - b.topListRank);
    const buckets = { Masterpiece: [], Amazing: [], Great: [] };
    list.forEach(g => {
      const tier = TIER(g.rating.total);
      if (buckets[tier.label]) buckets[tier.label].push(g);
    });
    return ['Masterpiece', 'Amazing', 'Great']
      .filter(k => buckets[k].length > 0)
      .map(k => ({ key: k, games: buckets[k] }));
  }, [games]);

  return (
    <div className="space-y-4 pb-32">
      {groups.map(group => (
        <div key={group.key}>
          <div className="serif text-[22px] mb-1 px-5" style={{ color: TIER_COLOR_FOR_LABEL[group.key] }}>
            {group.key}
            <span className="text-zinc-500 text-[14px] ml-2 tabular-nums">{group.games.length}</span>
          </div>
          <CoverFlowRow
            items={group.games}
            renderItem={g => <GameCard game={g} onClick={() => onSelect(g)} />}
            flowKey={`top50-${group.key}`}
          />
        </div>
      ))}
    </div>
  );
};

const PlayingView = ({ games, onSelect }) => {
  const list = useMemo(() => games.filter(g => g.state === 'playing'), [games]);
  if (list.length === 0) {
    return <EmptyState title="Not playing anything" subtitle="Move a game from Upcoming or Recommended to Playing." />;
  }
  return (
    <div className="px-4 pb-32 grid grid-cols-2 gap-3">
      {list.map(g => <GameCard key={g.id} game={g} onClick={() => onSelect(g)} />)}
    </div>
  );
};

const UpcomingView = ({ games, onSelect }) => {
  const groups = useMemo(() => {
    const list = games.filter(g => g.state === 'upcoming');
    list.sort((a, b) => upcomingSortKey(a) - upcomingSortKey(b));

    // Build year buckets dynamically — any year that has games shows up,
    // sorted chronologically. "Available now" goes first; "TBD" goes last.
    const buckets = {};
    list.forEach(g => {
      const sk = upcomingSortKey(g);
      let key;
      if (sk === 0) key = 'Available now';
      else if (sk < 10000) key = 'TBD';
      else key = String(Math.floor(sk / 10000));
      (buckets[key] = buckets[key] || []).push(g);
    });

    // Order: Available now, then ascending years, then TBD
    const yearKeys = Object.keys(buckets).filter(k => /^\d+$/.test(k)).sort();
    const ordered = [];
    if (buckets['Available now']) ordered.push('Available now');
    ordered.push(...yearKeys);
    if (buckets['TBD']) ordered.push('TBD');

    return ordered.map(k => ({ key: k, games: buckets[k] }));
  }, [games]);

  return (
    <div className="space-y-4 pb-32">
      {groups.map(g => (
        <div key={g.key}>
          <div className="serif text-[22px] mb-1 px-5" style={{ color: '#d4a574' }}>
            {g.key}
            <span className="text-zinc-500 text-[14px] ml-2 tabular-nums">{g.games.length}</span>
          </div>
          <CoverFlowRow
            items={g.games}
            renderItem={x => <GameCard game={x} onClick={() => onSelect(x)} />}
            flowKey={`upcoming-${g.key}`}
          />
        </div>
      ))}
    </div>
  );
};

const RumoredView = ({ games, onSelect, onReorder }) => {
  const list = useMemo(() => games.filter(g => g.state === 'rumored'), [games]);
  return (
    <div className="px-4 pb-32">
      <div className="glass rounded-3xl overflow-hidden divide-y divide-white/5">
        {list.map((game, i) => (
          <div
            key={game.id}
            className="w-full px-2 py-1.5 flex items-center gap-1 hover:bg-white/5 transition-colors"
          >
            <div className="flex flex-col">
              <button
                onClick={() => onReorder(game.id, -1)}
                disabled={i === 0}
                className={`p-1 rounded ${i === 0 ? 'opacity-25' : 'hover:bg-white/10 active:bg-white/15'}`}
                aria-label="Move up"
              >
                <Icon name="arrowUp" className="w-3.5 h-3.5 text-zinc-400" />
              </button>
              <button
                onClick={() => onReorder(game.id, +1)}
                disabled={i === list.length - 1}
                className={`p-1 rounded ${i === list.length - 1 ? 'opacity-25' : 'hover:bg-white/10 active:bg-white/15'}`}
                aria-label="Move down"
              >
                <Icon name="arrowDown" className="w-3.5 h-3.5 text-zinc-400" />
              </button>
            </div>
            <button
              onClick={() => onSelect(game)}
              className="flex-1 text-left px-2 py-2 min-w-0"
            >
              <div className="serif text-[17px] leading-tight truncate">{game.title}</div>
              {game.notes && (
                <div className="text-[12px] text-zinc-500 mt-0.5 truncate">{game.notes}</div>
              )}
            </button>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium shrink-0 pr-2">
              TBD
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Compact card for a RAWG candidate (matches GameCard visual language but
// shows a Metacritic badge in the top-left instead of state/rank). Tap
// opens the action sheet — save for later or dismiss.
const RecCandidateCard = ({ candidate, onClick }) => {
  const cover = candidate.coverImage;
  const plat = shortPlatform(pickBestPlatform(candidate.platforms));
  const metaLine = [candidate.year, plat].filter(Boolean).join(' · ');
  const mc = candidate.metacritic;
  const mcColor = mc >= 90 ? '#e2b878' : mc >= 80 ? '#a8b4c0' : '#b87349';

  return (
    <button
      onClick={onClick}
      className="relative group text-left w-full aspect-[3/4] rounded-2xl overflow-hidden grain"
      style={cover ? { background: '#0a0a0c' } : { background: gradientFor({ title: candidate.title, platform: plat }) }}
    >
      {cover && (
        <img src={cover} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      )}
      {cover && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/20" />
      )}
      <div className="absolute inset-0 flex flex-col justify-end p-3 gap-1.5">
        <div className="flex items-center justify-between gap-2">
          {mc ? (
            <div className="glass-light rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums" style={{ color: mcColor }}>
              {mc}
            </div>
          ) : <div />}
          <div />
        </div>
        <div className="glass rounded-xl px-3 py-2.5">
          <div className="serif text-[17px] leading-[1.1] text-white line-clamp-2">{candidate.title}</div>
          {metaLine && (
            <div className="text-[10px] uppercase tracking-wide text-zinc-400 font-medium leading-tight mt-1.5">
              {metaLine}
            </div>
          )}
        </div>
      </div>
    </button>
  );
};

// Bottom action sheet shown when a "For you" card is tapped.
const RecActionSheet = ({ candidate, onClose, onSave, onDismiss }) => {
  useEffect(() => {
    if (!candidate) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [candidate]);
  if (!candidate) return null;
  const plat = shortPlatform(pickBestPlatform(candidate.platforms));
  const metaLine = [candidate.year, plat].filter(Boolean).join(' · ');
  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mt-auto bg-ink-950 rounded-t-3xl border-t border-white/10 max-w-md mx-auto w-full pb-safe">
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-9 h-1 rounded-full bg-white/15" />
        </div>
        <div className="px-5 pt-3 pb-4 flex items-center gap-3 border-b border-white/5">
          <div className="w-14 h-[72px] rounded-lg overflow-hidden shrink-0" style={candidate.coverImage ? { background: '#0a0a0c' } : { background: gradientFor({ title: candidate.title, platform: plat }) }}>
            {candidate.coverImage && (
              <img src={candidate.coverImage} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="serif text-[18px] leading-tight text-white line-clamp-2">{candidate.title}</div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium mt-1">
              {metaLine}
              {candidate.metacritic && <span className="ml-2 text-zinc-400">MC {candidate.metacritic}</span>}
            </div>
          </div>
        </div>
        <div className="p-3 flex flex-col gap-2">
          <button
            onClick={onSave}
            className="w-full rounded-2xl bg-white text-ink-950 py-3 text-[15px] font-medium"
          >
            Save for later
          </button>
          <button
            onClick={onDismiss}
            className="w-full rounded-2xl glass-light text-zinc-200 py-3 text-[15px] font-medium"
          >
            Dismiss
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-2xl text-zinc-500 py-3 text-[14px]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// Convert a RAWG candidate into a library Game with state='recommended'
const candidateToGame = (c) => ({
  id: c.rawgId ? `rawg-${c.rawgId}` : `manual-${Date.now()}`,
  title: c.title,
  state: 'recommended',
  notes: '',
  coverImage: c.coverImage || null,
  rawgId: c.rawgId,
  rawgReleased: c.released || null,
  rawgPlatforms: c.platforms || [],
  rawgPlaytime: c.playtime || null,
  rawgGenres: c.genres || [],
  rawgMetacritic: c.metacritic || null,
  rawgChecked: true,
  year: c.year || undefined,
});

const RecommendedView = ({ games, onSelect, addGame, applyPatchToGame }) => {
  const savedList = useMemo(() => {
    const ls = games.filter(g => g.state === 'recommended');
    ls.sort((a, b) => (primaryYear(b) || 0) - (primaryYear(a) || 0));
    return ls;
  }, [games]);

  const [recsState, setRecsState] = useState(loadRecs);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeCandidate, setActiveCandidate] = useState(null);
  const refreshStartedRef = useRef(false);

  const ownedRawgIds = useMemo(
    () => new Set(games.map(g => g.rawgId).filter(Boolean)),
    [games]
  );
  const dismissedSet = useMemo(
    () => new Set(recsState.dismissedIds),
    [recsState.dismissedIds]
  );

  const forYou = useMemo(() =>
    recsState.candidates
      .filter(c => !ownedRawgIds.has(c.rawgId) && !dismissedSet.has(c.rawgId))
      .slice(0, 20),
    [recsState.candidates, ownedRawgIds, dismissedSet]
  );

  const refresh = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      // One-time backfill of dev/publisher detail for Top 50 (free for repeat visits)
      await enrichTop50Detail(games, applyPatchToGame);
      // buildTasteProfile reads from `games` prop; since applyPatchToGame
      // mutates state asynchronously, we re-read from latest source by
      // refetching from window storage as a safety net.
      let liveGames = games;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) liveGames = JSON.parse(raw);
      } catch {}
      const profile = buildTasteProfile(liveGames);
      const candidates = await fetchRecommendations(profile);
      const next = { ...recsState, fetchedAt: Date.now(), candidates };
      setRecsState(next);
      saveRecs(next);
    } catch (e) {
      setError(e.message || 'Could not load recommendations');
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh on first mount if cache is empty or stale
  useEffect(() => {
    if (refreshStartedRef.current) return;
    refreshStartedRef.current = true;
    const stale = !recsState.fetchedAt || (Date.now() - recsState.fetchedAt > RECS_TTL_MS);
    if (stale || recsState.candidates.length === 0) {
      refresh();
    }
  }, []);

  const handleSave = () => {
    if (!activeCandidate) return;
    const g = candidateToGame(activeCandidate);
    if (!ownedRawgIds.has(g.rawgId)) addGame(g);
    setActiveCandidate(null);
  };
  const handleDismiss = () => {
    if (!activeCandidate) return;
    const next = {
      ...recsState,
      dismissedIds: [...new Set([...recsState.dismissedIds, activeCandidate.rawgId])],
    };
    setRecsState(next);
    saveRecs(next);
    setActiveCandidate(null);
  };

  const lastFetchedLabel = recsState.fetchedAt
    ? new Date(recsState.fetchedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';

  return (
    <div className="space-y-5 pb-32">
      {/* FOR YOU — RAWG-driven */}
      <div>
        <div className="flex items-end justify-between px-5 mb-1">
          <div className="serif text-[22px]" style={{ color: '#d4a574' }}>
            For you
            {forYou.length > 0 && (
              <span className="text-zinc-500 text-[14px] ml-2 tabular-nums">{forYou.length}</span>
            )}
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="glass-light rounded-full px-3 py-1 text-[11px] uppercase tracking-wider text-zinc-300 font-medium disabled:opacity-50"
          >
            {loading ? 'Loading…' : (lastFetchedLabel ? `Refresh · ${lastFetchedLabel}` : 'Refresh')}
          </button>
        </div>
        {error && (
          <div className="px-5 text-[12px] text-rose-300/80">{error}</div>
        )}
        {loading && forYou.length === 0 ? (
          <div className="px-5 py-6 text-[12px] text-zinc-500">
            Reading your library… fetching matching games from RAWG.
          </div>
        ) : forYou.length === 0 ? (
          <div className="px-5 text-[12px] text-zinc-500">
            {error ? '' : 'No matches yet — rate more games to build a profile.'}
          </div>
        ) : (
          <CoverFlowRow
            items={forYou}
            idKey="rawgId"
            renderItem={c => (
              <RecCandidateCard candidate={c} onClick={() => setActiveCandidate(c)} />
            )}
            flowKey="recs-foryou"
          />
        )}
      </div>

      {/* SAVED FOR LATER — existing manual list */}
      <div>
        <div className="serif text-[22px] mb-1 px-5" style={{ color: '#d4a574' }}>
          Saved for later
          {savedList.length > 0 && (
            <span className="text-zinc-500 text-[14px] ml-2 tabular-nums">{savedList.length}</span>
          )}
        </div>
        {savedList.length === 0 ? (
          <div className="px-5 text-[12px] text-zinc-500">
            Tap a "For you" card to save it here.
          </div>
        ) : (
          <CoverFlowRow
            items={savedList}
            renderItem={g => <GameCard game={g} onClick={() => onSelect(g)} />}
            flowKey="recs-saved"
          />
        )}
      </div>

      <RecActionSheet
        candidate={activeCandidate}
        onClose={() => setActiveCandidate(null)}
        onSave={handleSave}
        onDismiss={handleDismiss}
      />
    </div>
  );
};

// Native-styled sort/filter button — wraps an invisible <select> so iOS
// shows its native picker on tap. Clean, accessible, zero JS work.
const SortFilterSelect = ({ label, value, onChange, options, groups }) => {
  const flat = [
    ...options,
    ...((groups || []).flatMap(g => g.options)),
  ];
  const displayLabel = flat.find(o => o[0] === value)?.[1] || '—';
  return (
    <div className="relative glass-light rounded-full px-3 py-1.5 flex items-center gap-1.5 text-[12px]">
      <span className="text-zinc-500 uppercase tracking-wider font-medium">{label}</span>
      <span className="text-zinc-100 font-medium">{displayLabel}</span>
      <Icon name="chevron" className="w-3 h-3 text-zinc-400" />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        {(groups || []).map(g => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </optgroup>
        ))}
      </select>
    </div>
  );
};

const PlayedView = ({ games, onSelect }) => {
  const [sort, setSort] = useState('yearDesc');
  const [filter, setFilter] = useState('all');

  // Dynamic console + year option lists from the data
  const { consoles, years } = useMemo(() => {
    const cs = new Set(), ys = new Set();
    games.forEach(g => {
      if (g.state !== 'played') return;
      const p = primaryPlatform(g);
      if (p) cs.add(p);
      if (g.year) ys.add(g.year);
    });
    return {
      consoles: [...cs].sort((a, b) => {
        const platformOrderIdx = (short) => {
          const i = PLATFORM_PRIORITY.findIndex(p => shortPlatform(p) === short);
          return i === -1 ? 999 : i;
        };
        return platformOrderIdx(a) - platformOrderIdx(b);
      }),
      years: [...ys].sort((a, b) => b - a),
    };
  }, [games]);

  // FILTER
  const filtered = useMemo(() => {
    const list = games.filter(g => g.state === 'played');
    if (filter === 'all') return list;
    if (filter === 'top50') return list.filter(g => g.topListRank != null);
    if (filter === 'masterpiece') return list.filter(g => (g.rating?.total ?? 0) >= 100);
    if (filter === 'outsideTop50') return list.filter(g => g.topListRank == null);
    if (filter.startsWith('console:')) {
      const p = filter.slice(8);
      return list.filter(g => primaryPlatform(g) === p);
    }
    if (filter.startsWith('year:')) {
      const y = parseInt(filter.slice(5), 10);
      return list.filter(g => g.year === y);
    }
    return list;
  }, [games, filter]);

  // SORT + GROUP — group key depends on sort mode
  const groups = useMemo(() => {
    const list = [...filtered];

    const consoleIdx = (g) => {
      const p = primaryPlatform(g);
      const i = PLATFORM_PRIORITY.findIndex(x => shortPlatform(x) === p);
      return i === -1 ? 999 : i;
    };

    if (sort === 'yearDesc') {
      list.sort((a, b) => ((b.year || 0) - (a.year || 0)) || ((a.topListRank ?? 999) - (b.topListRank ?? 999)));
    } else if (sort === 'yearAsc') {
      list.sort((a, b) => ((a.year || 0) - (b.year || 0)) || ((a.topListRank ?? 999) - (b.topListRank ?? 999)));
    } else if (sort === 'console') {
      list.sort((a, b) => (consoleIdx(a) - consoleIdx(b)) || ((b.year || 0) - (a.year || 0)));
    } else if (sort === 'rating') {
      list.sort((a, b) => (b.rating?.total ?? -1) - (a.rating?.total ?? -1));
    }

    let keyFn, sortKeys;
    if (sort === 'yearDesc' || sort === 'yearAsc') {
      keyFn = g => g.year ? String(g.year) : 'Year unknown';
      sortKeys = sort === 'yearDesc'
        ? (a, b) => (parseInt(b) || 0) - (parseInt(a) || 0)
        : (a, b) => (parseInt(a) || 0) - (parseInt(b) || 0);
    } else if (sort === 'console') {
      keyFn = g => primaryPlatform(g) || 'Unknown';
      sortKeys = (a, b) => {
        const ai = PLATFORM_PRIORITY.findIndex(p => shortPlatform(p) === a);
        const bi = PLATFORM_PRIORITY.findIndex(p => shortPlatform(p) === b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      };
    } else { // rating
      keyFn = g => g.rating ? TIER(g.rating.total).label : 'Unrated';
      const order = ['Masterpiece', 'Amazing', 'Great', 'Good', 'Mixed', 'Unrated'];
      sortKeys = (a, b) => order.indexOf(a) - order.indexOf(b);
    }

    const buckets = {};
    list.forEach(g => {
      const k = keyFn(g);
      (buckets[k] = buckets[k] || []).push(g);
    });
    return Object.keys(buckets).sort(sortKeys).map(k => ({ key: k, games: buckets[k] }));
  }, [filtered, sort]);

  const groupColor = (key) => TIER_COLOR_FOR_LABEL[key] || '#d4a574';

  return (
    <div className="screen-enter">
      <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
        <SortFilterSelect
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            ['yearDesc', 'Year (recent → oldest)'],
            ['yearAsc',  'Year (oldest → recent)'],
            ['console',  'Console (newest → oldest)'],
            ['rating',   'Rating (Masterpiece → Good)'],
          ]}
        />
        <SortFilterSelect
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[['all', 'All']]}
          groups={[
            { label: 'Rating', options: [
              ['top50',        'Top 50'],
              ['masterpiece',  'Masterpiece'],
              ['outsideTop50', 'Outside Top 50'],
            ]},
            { label: 'Console', options: consoles.map(c => [`console:${c}`, c]) },
            { label: 'Year',    options: years.map(y => [`year:${y}`, String(y)]) },
          ]}
        />
      </div>

      <div className="px-4 space-y-6 pb-32">
        {groups.map(group => (
          <div key={group.key}>
            <div className="serif text-[22px] mb-2 px-1" style={{ color: groupColor(group.key) }}>{group.key}</div>
            <div className="glass rounded-3xl overflow-hidden divide-y divide-white/5">
              {group.games.map(game => {
                const tier = game.rating ? TIER(game.rating.total) : null;
                const isTop50 = game.topListRank != null;
                const plat = primaryPlatform(game);
                return (
                  <button
                    key={game.id}
                    onClick={() => onSelect(game)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <div className="w-4 shrink-0 flex justify-center">
                      {isTop50 && <Icon name="star" filled className="w-3.5 h-3.5" style={{ color: tier?.color }} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="serif text-[17px] leading-tight truncate">{game.title}</div>
                    </div>
                    {plat && (
                      <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium shrink-0">
                        {plat}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {groups.length === 0 && (
          <EmptyState title="Nothing matches" subtitle="Try a different filter." />
        )}
      </div>
    </div>
  );
};

const EmptyState = ({ title, subtitle }) => (
  <div className="px-6 py-12 text-center text-zinc-500">
    <div className="serif text-2xl text-zinc-400 mb-1">{title}</div>
    <div className="text-sm">{subtitle}</div>
  </div>
);

// =============================================================================
// RECENT-RELEASE BANNER
// Surfaces tracked games whose release date has passed in the last 14 days.
// (When a Cloudflare Worker is added later, this same data feeds real push.)
// =============================================================================
const RecentReleaseBanner = ({ games, onSelect, dismissed, onDismiss }) => {
  const recent = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 14 * 86400000);
    return games.filter(g => {
      if (g.state !== 'upcoming') return false;
      const ed = g.expectedDate;
      if (!ed) return false;
      if (ed === 'Available') return true;
      const md = ed.match(/^(\d{1,2})\/(\d{1,2})$/);
      if (md) {
        const date = new Date(now.getFullYear(), parseInt(md[1], 10) - 1, parseInt(md[2], 10));
        return date <= now && date >= cutoff;
      }
      return false;
    });
  }, [games]);

  const visible = recent.filter(g => !dismissed.has(`release-${g.id}`));
  if (visible.length === 0) return null;

  return (
    <>
      {visible.map(g => {
        const exp = parseExpected(g.expectedDate);
        const plat = primaryPlatform(g);
        return (
          <div
            key={g.id}
            className="mx-4 mt-3 rounded-2xl overflow-hidden grain relative"
            style={{ background: 'linear-gradient(135deg, #78350f 0%, #1c1917 100%)' }}
          >
            <div className="p-4 flex items-center justify-between gap-3">
              <button onClick={() => onSelect(g)} className="min-w-0 flex-1 text-left">
                <div className="text-[10px] uppercase tracking-[0.22em] font-medium" style={{ color: '#e2b878' }}>
                  Recently Released
                </div>
                <div className="serif text-[20px] text-white leading-tight mt-0.5 truncate">{g.title}</div>
                <div className="text-[12px] text-zinc-300 mt-1 tabular-nums truncate">
                  {exp.label}{plat ? ` · ${plat}` : ''}
                </div>
              </button>
              <button
                onClick={() => onDismiss(`release-${g.id}`)}
                className="glass-light rounded-full p-2 shrink-0"
                aria-label="Dismiss"
              >
                <Icon name="close" className="w-4 h-4 text-zinc-300" />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
};

// =============================================================================
// LIBRARY SCREEN
// =============================================================================
const LibraryScreen = ({ games, onSelect, section, setSection, enrichStatus, onAdd, onOpenBackup, onReorderRumored, savedScrollsRef, tab, onTabChange, addGame, applyPatchToGame }) => {
  const [query, setQuery] = useState('');

  // Restore scroll positions captured before opening a detail screen
  useEffect(() => {
    if (!savedScrollsRef?.current) return;
    // Two RAFs: first lets layout settle, second lets cover-flow rows mount
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const s = savedScrollsRef.current;
      if (!s) return;
      window.scrollTo(0, s.y);
      document.querySelectorAll('[data-flowkey]').forEach(el => {
        const x = s.rows[el.dataset.flowkey];
        if (x != null) el.scrollLeft = x;
      });
      savedScrollsRef.current = null;
    }));
  }, []);

  const counts = useMemo(() => ({
    top50:       games.filter(g => g.topListRank != null).length,
    playing:     games.filter(g => g.state === 'playing').length,
    upcoming:    games.filter(g => g.state === 'upcoming').length,
    rumored:     games.filter(g => g.state === 'rumored').length,
    recommended: games.filter(g => g.state === 'recommended').length,
    played:      games.filter(g => g.state === 'played').length,
  }), [games]);

  // Apply search across the active section
  const filtered = useMemo(() => {
    if (!query) return games;
    return games.filter(g => g.title.toLowerCase().includes(query.toLowerCase()));
  }, [games, query]);

  return (
    <div className="screen-enter">
      <div className="pt-safe">
        <div className="px-4 pt-5 pb-1 flex items-end justify-between">
          <TitleNav active={tab} onChange={onTabChange} />
          <div className="flex items-center gap-1.5">
            <button onClick={onOpenBackup} className="glass-light rounded-full p-2" aria-label="Backup & data">
              <Icon name="settings" className="w-4 h-4" />
            </button>
            <button onClick={onAdd} className="glass-light rounded-full p-2" aria-label="Add game">
              <Icon name="plus" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {enrichStatus?.active && (
          <div className="px-4 mt-1 text-[11px] text-zinc-500 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
            Fetching covers · {enrichStatus.done} of {enrichStatus.total}
          </div>
        )}

        <div className="px-4 pt-4">
          <div className="glass-light rounded-2xl flex items-center gap-2 px-3.5 py-2.5">
            <Icon name="search" className="w-4 h-4 text-zinc-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search your library"
              className="bg-transparent flex-1 outline-none text-[15px] placeholder-zinc-500"
            />
          </div>
        </div>

        <SectionNav active={section} onChange={setSection} counts={counts} />

        {section === 'top50'       && <Top50View games={filtered} onSelect={onSelect} />}
        {section === 'playing'     && <PlayingView games={filtered} onSelect={onSelect} />}
        {section === 'upcoming'    && <UpcomingView games={filtered} onSelect={onSelect} />}
        {section === 'rumored'     && <RumoredView games={filtered} onSelect={onSelect} onReorder={onReorderRumored} />}
        {section === 'recommended' && <RecommendedView games={filtered} onSelect={onSelect} addGame={addGame} applyPatchToGame={applyPatchToGame} />}
        {section === 'played'      && <PlayedView games={filtered} onSelect={onSelect} />}
      </div>
    </div>
  );
};

// =============================================================================
// SPIDER CHART
// =============================================================================
const SpiderChart = ({ rating, color = '#d4a574', size = 280 }) => {
  const cx = size / 2, cy = size / 2;
  const radius = size * 0.32;
  const N = CATEGORIES.length;
  const labelR = radius + size * 0.085;
  const padX = 56, padY = 16;

  const point = (i, value) => {
    const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
    const r = (value / 10) * radius;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  };

  const dataPoints = CATEGORIES.map((c, i) => point(i, rating[c.key]));
  const polyStr = dataPoints.map(p => p.join(',')).join(' ');
  const rings = [2, 4, 6, 8, 10];

  return (
    <svg viewBox={`${-padX} ${-padY} ${size + padX * 2} ${size + padY * 2}`} className="w-full h-auto">
      {rings.map(v => {
        const pts = Array.from({ length: N }, (_, i) => point(i, v));
        return (
          <polygon key={v} points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        );
      })}
      {CATEGORIES.map((c, i) => {
        const [x, y] = point(i, 10);
        return <line key={c.key} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />;
      })}
      <polygon points={polyStr} fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {dataPoints.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.5" fill={color} />)}
      {CATEGORIES.map((c, i) => {
        const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
        const lx = cx + Math.cos(angle) * labelR;
        const ly = cy + Math.sin(angle) * labelR;
        const anchor = Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : (Math.cos(angle) > 0 ? 'start' : 'end');
        return (
          <text key={c.key} x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" fontSize="10" fontFamily="Inter" fontWeight="500" letterSpacing="0.5" fill="rgba(255,255,255,0.5)" style={{ textTransform: 'uppercase' }}>
            {c.label}
          </text>
        );
      })}
    </svg>
  );
};

// =============================================================================
// RATING BREAKDOWN
// =============================================================================
const RatingBreakdown = ({ rating, color }) => (
  <div className="space-y-2.5">
    {CATEGORIES.map(c => {
      const v = rating[c.key];
      return (
        <div key={c.key} className="flex items-center gap-3">
          <div className="text-[12px] uppercase tracking-wider text-zinc-400 w-20 shrink-0 font-medium">{c.label}</div>
          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${v * 10}%`, background: color }} />
          </div>
          <div className="text-[13px] tabular-nums w-5 text-right text-zinc-300 font-medium">{v}</div>
        </div>
      );
    })}
  </div>
);

// =============================================================================
// BOTTOM SHEET WRAPPER
// =============================================================================
const Sheet = ({ open, onClose, title, leftAction, rightAction, children }) => {
  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mt-auto bg-ink-950 rounded-t-3xl border-t border-white/10 max-w-md mx-auto w-full flex flex-col" style={{ height: '92vh' }}>
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-9 h-1 rounded-full bg-white/15" />
        </div>
        <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-white/5">
          <div className="w-16">{leftAction}</div>
          <div className="serif text-[18px] text-white">{title}</div>
          <div className="w-16 flex justify-end">{rightAction}</div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
};

// =============================================================================
// FORM BITS
// =============================================================================
const ALL_STATES = ['rumored', 'upcoming', 'recommended', 'playing', 'played'];

const StateSelector = ({ value, onChange }) => (
  <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
    {ALL_STATES.map(s => {
      const on = value === s;
      return (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-medium tracking-wide transition-all ${
            on ? 'bg-white text-ink-950' : 'glass-light text-zinc-300'
          }`}
        >
          {STATE_META[s].label}
        </button>
      );
    })}
  </div>
);

const FormSection = ({ label, children }) => (
  <div className="px-4 py-3 border-b border-white/5">
    <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium mb-2">{label}</div>
    {children}
  </div>
);

const TextInput = (props) => (
  <input
    {...props}
    className={`w-full bg-white/5 rounded-xl px-3 py-2 text-[15px] text-white placeholder-zinc-500 outline-none focus:bg-white/8 focus:ring-1 focus:ring-white/20 ${props.className || ''}`}
  />
);

const TextArea = (props) => (
  <textarea
    {...props}
    className={`w-full bg-white/5 rounded-xl px-3 py-2 text-[15px] text-white placeholder-zinc-500 outline-none focus:bg-white/8 focus:ring-1 focus:ring-white/20 resize-none ${props.className || ''}`}
  />
);

const RatingSliderRow = ({ label, value, onChange, color }) => (
  <div className="flex items-center gap-3 py-1">
    <div className="text-[12px] uppercase tracking-wider text-zinc-400 w-20 shrink-0 font-medium">{label}</div>
    <input
      type="range"
      min="0"
      max="10"
      step="1"
      value={value || 0}
      onChange={e => onChange(parseInt(e.target.value, 10))}
      className="flex-1 accent-amber-300"
      style={{ accentColor: color }}
    />
    <div className="text-[13px] tabular-nums w-5 text-right text-zinc-200 font-medium">{value || 0}</div>
  </div>
);

const Toggle = ({ label, value, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl ${value ? 'bg-white/10' : 'bg-white/5'}`}
  >
    <span className="text-[14px] text-zinc-100">{label}</span>
    <div className={`w-9 h-5 rounded-full relative transition-colors ${value ? 'bg-gold' : 'bg-white/15'}`}>
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${value ? 'left-4' : 'left-0.5'}`} />
    </div>
  </button>
);

// =============================================================================
// RAWG SEARCH (for Add flow)
// =============================================================================
const RawgSearch = ({ onPick, onSkip }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef();

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `${RAWG_BASE}/games?key=${RAWG_KEY}&search=${encodeURIComponent(q)}&page_size=6`;
        const res = await fetch(url);
        const data = await res.json();
        setResults(data.results || []);
      } catch (e) {
        setResults([]);
      }
      setLoading(false);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [q]);

  return (
    <div className="p-4 space-y-3">
      <TextInput
        autoFocus
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search RAWG by title…"
      />
      {loading && <div className="text-xs text-zinc-500 px-1">Searching…</div>}
      <div className="space-y-2">
        {results.map(r => (
          <button
            key={r.id}
            type="button"
            onClick={() => onPick(r)}
            className="w-full flex items-center gap-3 p-2 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors text-left"
          >
            <div className="w-16 h-16 rounded-xl bg-ink-900 overflow-hidden shrink-0">
              {r.background_image && (
                <img src={r.background_image} alt="" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="serif text-[16px] text-white leading-tight truncate">{r.name}</div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 mt-0.5">
                {[yearOf(r.released), shortPlatform(pickBestPlatform((r.platforms || []).map(p => p.platform?.name).filter(Boolean)))].filter(Boolean).join(' · ')}
              </div>
            </div>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="w-full text-center text-[13px] text-zinc-500 underline-offset-2 hover:underline pt-2"
      >
        Add manually without RAWG (e.g. for rumored games)
      </button>
    </div>
  );
};

// =============================================================================
// GAME FORM (used by Add + Edit)
// =============================================================================
const blankRating = () => ({
  narrative: 0, worldLevel: 0, gameplay: 0, art: 0, scoreAudio: 0,
  difficulty: 0, impact: 0, playTime: 0, emotional: 0, value: 0,
});

const ratingTotal = (r) => CATEGORIES.reduce((s, c) => s + (r[c.key] || 0), 0);

const blankForm = () => ({
  title: '',
  state: 'recommended',
  year: '',
  platform: '',
  topListRank: '',
  expectedDate: '',
  timeToBeat: '',
  notes: '',
  rating: null,
  completion: { story: false, platinum: false, replayed: false },
  coverImage: '',
  rawgId: null,
  rawgReleased: '',
  rawgPlatforms: [],
  rawgPlaytime: null,
  rawgChecked: false,
});

const formFromGame = (g) => ({
  ...blankForm(),
  ...g,
  year: g.year ?? '',
  platform: g.platform ?? '',
  topListRank: g.topListRank ?? '',
  expectedDate: g.expectedDate ?? '',
  timeToBeat: g.timeToBeat ?? '',
  notes: g.notes ?? '',
  rating: g.rating || null,
  completion: g.completion || { story: false, platinum: false, replayed: false },
});

const formFromRawg = (r) => ({
  ...blankForm(),
  title: r.name,
  year: yearOf(r.released) || '',
  coverImage: r.background_image || '',
  rawgId: r.id,
  rawgReleased: r.released || '',
  rawgPlatforms: (r.platforms || []).map(p => p.platform?.name).filter(Boolean),
  rawgPlaytime: r.playtime || null,
  rawgChecked: true,
});

const formToGame = (f, existingId) => {
  const g = {
    id: existingId || (f.rawgId ? `rawg-${f.rawgId}` : `manual-${Date.now()}`),
    title: f.title,
    state: f.state,
    notes: f.notes || '',
    coverImage: f.coverImage || null,
    rawgId: f.rawgId || null,
    rawgReleased: f.rawgReleased || null,
    rawgPlatforms: f.rawgPlatforms || [],
    rawgPlaytime: f.rawgPlaytime || null,
    rawgChecked: f.rawgChecked || false,
  };
  if (f.year) g.year = parseInt(f.year, 10);
  if (f.platform) g.platform = f.platform;
  if (f.state === 'upcoming' && f.expectedDate) g.expectedDate = f.expectedDate;
  if (f.state === 'recommended' && f.timeToBeat) g.timeToBeat = String(f.timeToBeat);
  if (f.state === 'played') {
    if (f.rating && ratingTotal(f.rating) > 0) g.rating = { ...f.rating, total: ratingTotal(f.rating) };
    if (f.topListRank) g.topListRank = parseInt(f.topListRank, 10);
    g.completion = f.completion;
  }
  return g;
};

const GameForm = ({ form, setForm, onDelete }) => {
  const setField = (k) => (v) => setForm(f => ({ ...f, [k]: v }));
  const setRating = (key, value) => setForm(f => ({
    ...f,
    rating: { ...(f.rating || blankRating()), [key]: value },
  }));
  const total = form.rating ? ratingTotal(form.rating) : 0;
  const tier = total >= 80 ? TIER(total) : null;
  const color = tier?.color || '#d4a574';

  return (
    <div className="pb-8">
      {/* Hero preview */}
      <div className="relative h-36 grain" style={form.coverImage ? { background: '#0a0a0c' } : { background: gradientFor({ title: form.title || '?', platform: form.platform }) }}>
        {form.coverImage && (
          <img src={form.coverImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-3 px-4">
          <div className="serif text-[26px] leading-tight text-white">{form.title || 'Untitled'}</div>
        </div>
      </div>

      <FormSection label="State">
        <StateSelector value={form.state} onChange={setField('state')} />
      </FormSection>

      <FormSection label="Title">
        <TextInput value={form.title} onChange={e => setField('title')(e.target.value)} placeholder="Game title" />
      </FormSection>

      {/* Year + Platform — always editable */}
      <FormSection label="Release year & platform">
        <div className="grid grid-cols-2 gap-2">
          <TextInput
            type="number"
            inputMode="numeric"
            value={form.year}
            onChange={e => setField('year')(e.target.value)}
            placeholder="Year"
          />
          <TextInput
            value={form.platform}
            onChange={e => setField('platform')(e.target.value)}
            placeholder="Console (e.g. PS5)"
          />
        </div>
      </FormSection>

      {/* Upcoming-only */}
      {form.state === 'upcoming' && (
        <FormSection label="Expected release">
          <TextInput
            value={form.expectedDate}
            onChange={e => setField('expectedDate')(e.target.value)}
            placeholder='e.g. "6/25", "Fall 2026", "H1 2026", "2027"'
          />
        </FormSection>
      )}

      {/* Recommended-only */}
      {form.state === 'recommended' && (
        <FormSection label="Time to beat (hours)">
          <TextInput
            type="number"
            inputMode="numeric"
            value={form.timeToBeat}
            onChange={e => setField('timeToBeat')(e.target.value)}
            placeholder="Optional"
          />
        </FormSection>
      )}

      {/* Played-only: rating + completion + rank */}
      {form.state === 'played' && (
        <>
          <FormSection label="Completion">
            <div className="grid grid-cols-1 gap-2">
              <Toggle label="Story finished"        value={form.completion.story}    onChange={v => setField('completion')({ ...form.completion, story: v })} />
              <Toggle label="Platinum / 100%"        value={form.completion.platinum} onChange={v => setField('completion')({ ...form.completion, platinum: v })} />
              <Toggle label="Replayed"               value={form.completion.replayed} onChange={v => setField('completion')({ ...form.completion, replayed: v })} />
            </div>
          </FormSection>

          <FormSection label={`Rating · Total ${total}/100${tier ? ` · ${tier.label}` : ''}`}>
            <div className="space-y-1">
              {CATEGORIES.map(c => (
                <RatingSliderRow
                  key={c.key}
                  label={c.label}
                  value={form.rating?.[c.key]}
                  onChange={v => setRating(c.key, v)}
                  color={color}
                />
              ))}
            </div>
          </FormSection>

          <FormSection label="Top 50 rank (optional)">
            <TextInput
              type="number"
              inputMode="numeric"
              value={form.topListRank}
              onChange={e => setField('topListRank')(e.target.value)}
              placeholder='Leave blank if not in Top 50. Set explicitly to break ties.'
            />
          </FormSection>
        </>
      )}

      <FormSection label="Notes">
        <TextArea
          rows="3"
          value={form.notes}
          onChange={e => setField('notes')(e.target.value)}
          placeholder='e.g. "Pre-ordered • Amazon", or any reminder'
        />
      </FormSection>

      {onDelete && (
        <div className="px-4 pt-6 pb-2">
          <button
            type="button"
            onClick={onDelete}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-500/10 text-red-300 text-[14px] font-medium hover:bg-red-500/15"
          >
            <Icon name="trash" className="w-4 h-4" />
            Delete this game
          </button>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// ADD GAME SHEET
// =============================================================================
const AddGameSheet = ({ open, onClose, onAdd, existingIds }) => {
  const [step, setStep] = useState('search');
  const [form, setForm] = useState(blankForm);

  useEffect(() => {
    if (open) { setStep('search'); setForm(blankForm()); }
  }, [open]);

  const pick = (r) => {
    setForm(formFromRawg(r));
    setStep('form');
  };
  const skipToManual = () => {
    setForm({ ...blankForm(), state: 'rumored' });
    setStep('form');
  };

  const handleSave = () => {
    if (!form.title.trim()) return;
    const newGame = formToGame(form);
    // Avoid id collision
    if (existingIds.has(newGame.id)) newGame.id = newGame.id + '-' + Math.random().toString(36).slice(2, 5);
    onAdd(newGame);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={step === 'search' ? 'Add a game' : 'New game'}
      leftAction={
        <button onClick={step === 'form' ? () => setStep('search') : onClose} className="text-zinc-400 text-[14px]">
          {step === 'form' ? 'Back' : 'Cancel'}
        </button>
      }
      rightAction={step === 'form' && (
        <button onClick={handleSave} className="text-[14px] font-semibold" style={{ color: '#d4a574' }}>
          Save
        </button>
      )}
    >
      {step === 'search'
        ? <RawgSearch onPick={pick} onSkip={skipToManual} />
        : <GameForm form={form} setForm={setForm} />}
    </Sheet>
  );
};

// =============================================================================
// EDIT GAME SHEET
// =============================================================================
const EditGameSheet = ({ open, game, onClose, onSave, onDelete }) => {
  const [form, setForm] = useState(blankForm);
  useEffect(() => {
    if (open && game) setForm(formFromGame(game));
  }, [open, game]);

  const handleSave = () => {
    if (!form.title.trim()) return;
    onSave(formToGame(form, game.id));
    onClose();
  };
  const handleDelete = () => {
    if (window.confirm(`Delete "${game.title}"? This cannot be undone.`)) {
      onDelete(game.id);
      onClose();
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit game"
      leftAction={<button onClick={onClose} className="text-zinc-400 text-[14px]">Cancel</button>}
      rightAction={
        <button onClick={handleSave} className="text-[14px] font-semibold" style={{ color: '#d4a574' }}>
          Save
        </button>
      }
    >
      <GameForm form={form} setForm={setForm} onDelete={handleDelete} />
    </Sheet>
  );
};

// =============================================================================
// BACKUP & DATA SHEET — single entry point for export / import (and Gist sync
// when we wire that up)
// =============================================================================
const BackupSheet = ({ open, onClose, onExport, onImport, games, setGames, gistConfig, setGistConfig }) => {
  const [tokenInput, setTokenInput] = useState('');
  const [gistIdInput, setGistIdInput] = useState('');
  const [connectMode, setConnectMode] = useState('new'); // 'new' | 'existing'
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (open) {
      setError(null); setSuccess(null);
      setTokenInput(''); setGistIdInput(''); setConnectMode('new');
    }
  }, [open]);

  const setupGist = async () => {
    if (!tokenInput.trim()) return;
    setBusy(true); setBusyAction('setup'); setError(null); setSuccess(null);
    try {
      const gist = await createGist(tokenInput.trim(), games);
      const config = {
        token: tokenInput.trim(),
        gistId: gist.id,
        gistUrl: gist.html_url,
        lastSyncedAt: Date.now(),
      };
      saveGistConfig(config);
      setGistConfig(config);
      setTokenInput('');
      setSuccess('Connected! Your library is backed up.');
    } catch (e) {
      setError(e.message || String(e));
    } finally { setBusy(false); setBusyAction(''); }
  };

  const connectExisting = async () => {
    if (!tokenInput.trim() || !gistIdInput.trim()) return;
    const id = gistIdInput.trim();
    if (!window.confirm(`Replace your local library with the version stored in Gist ${id.slice(0, 8)}…? Your current local data will be lost (export first if you want a safety copy).`)) return;
    setBusy(true); setBusyAction('connect'); setError(null); setSuccess(null);
    try {
      const gist = await ghRequest(tokenInput.trim(), `/gists/${id}`);
      const file = gist.files?.[GIST_FILENAME];
      if (!file) throw new Error(`This gist doesn't contain a ${GIST_FILENAME} file. Make sure you have the right Gist ID.`);
      const content = file.truncated ? await (await fetch(file.raw_url)).text() : file.content;
      const data = JSON.parse(content);
      if (!Array.isArray(data)) throw new Error('Gist contents are not a valid library array');
      setGames(data);
      const config = {
        token: tokenInput.trim(),
        gistId: gist.id,
        gistUrl: gist.html_url,
        lastSyncedAt: Date.now(),
      };
      saveGistConfig(config);
      setGistConfig(config);
      setTokenInput(''); setGistIdInput('');
      setSuccess(`Connected and restored ${data.length} games.`);
    } catch (e) {
      setError(e.message || String(e));
    } finally { setBusy(false); setBusyAction(''); }
  };

  const syncNow = async () => {
    if (!gistConfig) return;
    setBusy(true); setBusyAction('sync'); setError(null); setSuccess(null);
    try {
      await updateGist(gistConfig.token, gistConfig.gistId, games);
      const next = { ...gistConfig, lastSyncedAt: Date.now() };
      saveGistConfig(next);
      setGistConfig(next);
      setSuccess('Synced.');
    } catch (e) {
      setError(e.message || String(e));
    } finally { setBusy(false); setBusyAction(''); }
  };

  const restore = async () => {
    if (!gistConfig) return;
    if (!window.confirm('Replace your local library with the version stored in your Gist? Your current local data will be lost (export first if you want a safety copy).')) return;
    setBusy(true); setBusyAction('restore'); setError(null); setSuccess(null);
    try {
      const data = await fetchGistLibrary(gistConfig.token, gistConfig.gistId);
      setGames(data);
      const next = { ...gistConfig, lastSyncedAt: Date.now() };
      saveGistConfig(next);
      setGistConfig(next);
      setSuccess(`Restored ${data.length} games.`);
    } catch (e) {
      setError(e.message || String(e));
    } finally { setBusy(false); setBusyAction(''); }
  };

  const disconnect = () => {
    if (!window.confirm('Disconnect Gist sync? Your Gist will remain on GitHub but the app will stop syncing to it. You can reconnect anytime.')) return;
    clearGistConfig();
    setGistConfig(null);
    setSuccess('Disconnected.');
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Backup & data"
      leftAction={<button onClick={onClose} className="text-zinc-400 text-[14px]">Close</button>}
    >
      <div className="px-4 py-6 space-y-3">
        {/* GitHub Gist sync */}
        {gistConfig ? (
          <div className="glass rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-[18px] mt-0.5">☁️</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="serif text-[16px] text-white">GitHub Gist sync</div>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <div className="text-[12px] text-zinc-400 mt-0.5">
                  Auto-synced{' '}
                  <span className="tabular-nums">
                    {timeAgo(new Date(gistConfig.lastSyncedAt).toISOString())}
                  </span>
                  . Saves 5 sec after every change.
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    onClick={syncNow}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-[12px] font-medium disabled:opacity-50"
                  >
                    {busyAction === 'sync' ? 'Syncing…' : 'Sync now'}
                  </button>
                  <button
                    onClick={restore}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-[12px] font-medium disabled:opacity-50"
                  >
                    {busyAction === 'restore' ? 'Restoring…' : 'Restore from Gist'}
                  </button>
                  <button
                    onClick={disconnect}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-full text-[12px] font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                </div>
                {gistConfig.gistUrl && (
                  <a
                    href={gistConfig.gistUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-zinc-500 underline mt-2.5 inline-block"
                  >
                    View gist on GitHub →
                  </a>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="glass rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-[18px] mt-0.5">☁️</span>
              <div className="min-w-0 flex-1">
                <div className="serif text-[16px] text-white">GitHub Gist sync</div>
                <div className="text-[12px] text-zinc-400 mt-0.5 mb-3 leading-relaxed">
                  {connectMode === 'new'
                    ? <>Auto-sync your library to a private GitHub Gist. Survives clearing Safari data, restores easily to a new device. Paste a GitHub token with <strong className="text-zinc-300">Gists: Read &amp; write</strong> permission.</>
                    : <>Connect to a Gist you already have (e.g. when setting up a new phone). Your local library will be replaced by what's in the Gist.</>
                  }
                </div>

                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="github_pat_… or ghp_…"
                  className="w-full bg-white/5 rounded-xl px-3 py-2 text-[14px] text-white placeholder-zinc-500 outline-none focus:bg-white/10 mb-2 font-mono"
                />

                {connectMode === 'existing' && (
                  <input
                    value={gistIdInput}
                    onChange={(e) => setGistIdInput(e.target.value)}
                    placeholder="Gist ID (the long string after /gist.github.com/…)"
                    className="w-full bg-white/5 rounded-xl px-3 py-2 text-[14px] text-white placeholder-zinc-500 outline-none focus:bg-white/10 mb-2 font-mono"
                  />
                )}

                {connectMode === 'new' ? (
                  <button
                    onClick={setupGist}
                    disabled={busy || !tokenInput.trim()}
                    className="w-full py-2 rounded-xl bg-white text-ink-950 text-[13px] font-semibold disabled:opacity-40"
                  >
                    {busyAction === 'setup' ? 'Setting up…' : 'Set up new backup'}
                  </button>
                ) : (
                  <button
                    onClick={connectExisting}
                    disabled={busy || !tokenInput.trim() || !gistIdInput.trim()}
                    className="w-full py-2 rounded-xl bg-white text-ink-950 text-[13px] font-semibold disabled:opacity-40"
                  >
                    {busyAction === 'connect' ? 'Connecting…' : 'Connect & restore'}
                  </button>
                )}

                <div className="flex items-center justify-between gap-3 mt-2.5">
                  <button
                    type="button"
                    onClick={() => setConnectMode(connectMode === 'new' ? 'existing' : 'new')}
                    className="text-[11px] text-zinc-500 underline text-left"
                  >
                    {connectMode === 'new'
                      ? 'Have an existing Gist? Connect to it →'
                      : '← Create a new backup instead'}
                  </button>
                  <a
                    href="https://github.com/settings/personal-access-tokens/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-zinc-500 underline shrink-0"
                  >
                    Get token →
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Status messages */}
        {error && (
          <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-3 text-[12px] text-red-300 leading-relaxed">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-[12px] text-emerald-300">
            {success}
          </div>
        )}

        {/* Manual export/import */}
        <button
          onClick={() => { onExport(); onClose(); }}
          className="w-full glass rounded-2xl p-4 text-left flex items-start gap-3 hover:bg-white/5 active:bg-white/10 transition-colors"
        >
          <Icon name="download" className="w-5 h-5 mt-0.5 text-zinc-300" />
          <div className="min-w-0 flex-1">
            <div className="serif text-[16px] text-white">Export library</div>
            <div className="text-[12px] text-zinc-400 mt-0.5">
              Download your library as a JSON file. Good for one-off backups to iCloud Files.
            </div>
          </div>
        </button>

        <button
          onClick={() => { onImport(); onClose(); }}
          className="w-full glass rounded-2xl p-4 text-left flex items-start gap-3 hover:bg-white/5 active:bg-white/10 transition-colors"
        >
          <Icon name="upload" className="w-5 h-5 mt-0.5 text-zinc-300" />
          <div className="min-w-0 flex-1">
            <div className="serif text-[16px] text-white">Import from file</div>
            <div className="text-[12px] text-zinc-400 mt-0.5">
              Replace your library with a previously-exported JSON file.
            </div>
          </div>
        </button>
      </div>
    </Sheet>
  );
};

// =============================================================================
// JSON EXPORT + IMPORT
// =============================================================================
const exportLibrary = (games) => {
  const blob = new Blob([JSON.stringify(games, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `video-game-library-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// =============================================================================
// GITHUB GIST SYNC
// Your library JSON lives in a private gist on YOUR GitHub account.
// Token + gist ID live in localStorage; nothing leaves your phone except
// the writes to your own GitHub.
// =============================================================================
const GIST_FILENAME = 'video-game-library.json';

const loadGistConfig = () => {
  try {
    const raw = localStorage.getItem(GIST_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};
const saveGistConfig = (config) => {
  try { localStorage.setItem(GIST_KEY, JSON.stringify(config)); } catch {}
};
const clearGistConfig = () => { try { localStorage.removeItem(GIST_KEY); } catch {} };

async function ghRequest(token, path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 200) || res.statusText}`);
  }
  return res.json();
}

async function createGist(token, games) {
  return ghRequest(token, '/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: 'Video Game Library backup',
      public: false,
      files: {
        [GIST_FILENAME]: { content: JSON.stringify(games, null, 2) },
      },
    }),
  });
}

async function updateGist(token, gistId, games) {
  return ghRequest(token, `/gists/${gistId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: { content: JSON.stringify(games, null, 2) },
      },
    }),
  });
}

async function fetchGistLibrary(token, gistId) {
  const gist = await ghRequest(token, `/gists/${gistId}`);
  const file = gist.files?.[GIST_FILENAME];
  if (!file) throw new Error(`No ${GIST_FILENAME} in this gist`);
  const content = file.truncated ? await (await fetch(file.raw_url)).text() : file.content;
  const data = JSON.parse(content);
  if (!Array.isArray(data)) throw new Error('Gist contents are not a valid library array');
  return data;
}

const importLibrary = (setGames) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('Expected an array of games');
      if (!data.every(g => g && typeof g.id === 'string' && typeof g.title === 'string' && typeof g.state === 'string')) {
        throw new Error('File does not look like a Video Game Library export');
      }
      if (window.confirm(`Replace your current library with ${data.length} games from this file? Your current data will be lost (export first if you want a backup).`)) {
        setGames(data);
      }
    } catch (e) {
      window.alert(`Could not import: ${e.message}`);
    }
  };
  input.click();
};

// =============================================================================
// GAME DETAIL SCREEN
// =============================================================================
// Ordered list of game IDs for prev/next navigation in the detail screen —
// mirrors how each library section orders its cards so the arrows feel like
// stepping through the row you opened the game from.
const buildNavOrder = (games, section) => {
  let list;
  switch (section) {
    case 'top50':
      list = games.filter(g => g.topListRank != null).sort((a, b) => a.topListRank - b.topListRank);
      break;
    case 'playing':
      list = games.filter(g => g.state === 'playing');
      break;
    case 'upcoming':
      list = games.filter(g => g.state === 'upcoming').sort((a, b) => upcomingSortKey(a) - upcomingSortKey(b));
      break;
    case 'rumored':
      list = games.filter(g => g.state === 'rumored');
      break;
    case 'recommended':
      list = games.filter(g => g.state === 'recommended').sort((a, b) => (primaryYear(b) || 0) - (primaryYear(a) || 0));
      break;
    case 'played':
      list = games.filter(g => g.state === 'played')
        .sort((a, b) => ((b.year || 0) - (a.year || 0)) || ((a.topListRank ?? 999) - (b.topListRank ?? 999)));
      break;
    default:
      list = games;
  }
  return list.map(g => g.id);
};

  
const GameDetailScreen = ({ game, onBack, onEdit, onToggleCompletion, onPrev, onNext, hasPrev, hasNext }) => {
  const tier = game.rating ? TIER(game.rating.total) : null;
  const color = tier?.color || '#a1a1aa';

  // Always start detail screens at the top of the page
  useEffect(() => { window.scrollTo(0, 0); }, [game.id]);

  const cover = effectiveCover(game);
  return (
    <div className="screen-enter pb-32">
      <div className="relative w-full aspect-[4/3] grain" style={cover ? { background: '#0a0a0c' } : { background: gradientFor(game) }}>
        {cover && (
          <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-ink-950" />
        <div className="absolute inset-0 flex flex-col pt-safe">
          <div className="flex items-center justify-between px-4 pt-3">
            <button onClick={onBack} className="glass-light rounded-full p-2.5">
              <Icon name="back" className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              {game.topListRank != null && (
                <div className="glass rounded-full px-3 py-1.5 flex items-center gap-1.5">
                  <Icon name="star" filled className="w-3.5 h-3.5" style={{ color: tier.color }} />
                  <span className="text-[12px] font-semibold tracking-wide" style={{ color: tier.color }}>
                    #{game.topListRank} of 50
                  </span>
                </div>
              )}
              <button onClick={onEdit} className="glass-light rounded-full p-2.5" aria-label="Edit game">
                <Icon name="edit" className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Prev / next game navigation — steps through the current section */}
          {hasPrev && (
            <button
              onClick={onPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 glass-light rounded-full p-2.5 z-20"
              aria-label="Previous game"
            >
              <Icon name="back" className="w-5 h-5" />
            </button>
          )}
          {hasNext && (
            <button
              onClick={onNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 glass-light rounded-full p-2.5 z-20"
              aria-label="Next game"
            >
              <Icon name="back" className="w-5 h-5" style={{ transform: 'rotate(180deg)' }} />
            </button>
          )}

          <div className="mt-auto px-4 pb-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/60 font-medium mb-2">
              {[
                STATE_META[game.state]?.label,
                primaryYear(game),
                primaryPlatform(game),
                game.expectedDate ? parseExpected(game.expectedDate).label : null,
              ].filter(Boolean).join(' · ')}
            </div>
            <h1 className="serif text-[40px] leading-[0.95] text-white">{game.title}</h1>
            {game.state === 'playing' && game.rawgPlaytime && (
              <div className="mt-3 inline-flex items-center gap-1.5 glass-light rounded-full px-3 py-1.5">
                <Icon name="clock" className="w-3.5 h-3.5 text-zinc-300" />
                <span className="text-[12px] font-medium text-zinc-200">~{game.rawgPlaytime} hrs avg playtime</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {game.rating ? (
        <>
          <div className="px-4 pt-6 pb-4">
            <div className="glass rounded-3xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium">Total Score</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="serif text-[68px] leading-none" style={{ color }}>{game.rating.total}</span>
                    <span className="text-zinc-500 text-lg">/ 100</span>
                  </div>
                  <div className="mt-1 text-[13px] font-medium uppercase tracking-wider" style={{ color }}>{tier.label}</div>
                </div>
              </div>

              <div className="mt-4 -mx-2">
                <SpiderChart rating={game.rating} color={color} />
              </div>
            </div>
          </div>

          <div className="px-4 pt-2">
            <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium mb-3">Breakdown</div>
            <div className="glass rounded-3xl p-5">
              <RatingBreakdown rating={game.rating} color={color} />
            </div>
          </div>

          <div className="px-4 pt-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium">Status</div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium">Tap to toggle</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'story', label: 'Story', icon: 'check' },
                { key: 'platinum', label: 'Platinum', icon: 'trophy' },
                { key: 'replayed', label: 'Replayed', icon: 'replay' },
              ].map(f => {
                const on = game.completion?.[f.key];
                return (
                  <button
                    key={f.key}
                    onClick={() => onToggleCompletion?.(game.id, f.key)}
                    className={`glass rounded-2xl p-3 flex flex-col items-center gap-1.5 transition-all active:scale-95 ${on ? 'ring-1 ring-white/15' : 'opacity-40'}`}
                    aria-pressed={!!on}
                  >
                    <Icon name={f.icon} className="w-5 h-5" style={{ color: on ? color : '#71717a' }} />
                    <div className="text-[11px] uppercase tracking-wider font-medium">{f.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="px-4 pt-6">
          <div className="glass rounded-3xl p-6">
            <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium mb-2">State</div>
            <div className="serif text-2xl text-zinc-100">{STATE_META[game.state]?.label}</div>
            <div className="text-zinc-400 text-sm mt-1">{STATE_META[game.state]?.verb}</div>
            {game.expectedDate && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium">Expected</div>
                <div className="serif text-xl mt-1" style={{ color: '#d4a574' }}>
                  {parseExpected(game.expectedDate).label}
                </div>
              </div>
            )}
            {game.timeToBeat && (
              <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
                <Icon name="clock" className="w-4 h-4 text-zinc-400" />
                <span className="text-sm text-zinc-300">~{game.timeToBeat} hours</span>
              </div>
            )}
            {game.notes && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium mb-1">Notes</div>
                <div className="text-sm text-zinc-300">{game.notes}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// NEWS — fetched live from the Cloudflare Worker
// =============================================================================
const NEWS_URL = `${WORKER_BASE}/news`;
const ARTICLE_URL = (url) => `${WORKER_BASE}/article?url=${encodeURIComponent(url)}`;
const NEWS_CACHE_KEY = 'vgl.news.v2';

// Mark-as-read state — persists across sessions
const loadRead = () => {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
};
const saveRead = (set) => {
  try { localStorage.setItem(READ_KEY, JSON.stringify([...set])); } catch {}
};
const articleKey = (article) => article?.id || article?.url || '';

// Each podcast show needs a cover gradient (the Worker doesn't supply one) —
// look it up by show id and fall back to a neutral default.
const PODCAST_PRESENTATION = {
  'kinda-funny-games-daily': {
    accent: '#e2b878',
    coverGradient: 'linear-gradient(135deg, #c2410c 0%, #7c2d12 100%)',
  },
  'kinda-funny-gamescast': {
    accent: '#a8b4c0',
    coverGradient: 'linear-gradient(135deg, #0c4a6e 0%, #1e293b 100%)',
  },
};
const podcastPresentation = (id) =>
  PODCAST_PRESENTATION[id] || {
    accent: '#a1a1aa',
    coverGradient: 'linear-gradient(135deg, #27272a 0%, #18181b 100%)',
  };

const loadCachedNews = () => {
  try {
    const raw = localStorage.getItem(NEWS_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};
const saveCachedNews = (data) => {
  try { localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(data)); } catch {}
};

// Normalize Worker payload — apply podcast presentation gradients/accents,
// stamp a local fetchedAt so we know how fresh the cached copy is.
const normalizeNewsPayload = (payload) => {
  if (!payload) return null;
  const podcasts = (payload.podcasts || []).map((p) => ({ ...podcastPresentation(p.id), ...p }));
  return { ...payload, podcasts, _cachedAt: Date.now() };
};

// React hook: returns { news, loading, error, refresh, lastFetched }
// Loading is initialized to true when there's no cache OR the cache is older
// than 30 min — the latter keeps the relative-time podcast labels from
// flashing a stale "N DAYS AGO" for what's actually still last-week's episode.
const useNews = () => {
  const initialCache = loadCachedNews();
  const initialStale = !initialCache?._cachedAt ||
    (Date.now() - initialCache._cachedAt > NEWS_STALE_MS);
  const [news, setNews] = useState(initialCache);
  const [loading, setLoading] = useState(!initialCache || initialStale);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(initialCache?._cachedAt || null);

  const refresh = useRef(null);
  refresh.current = async (forceFresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = forceFresh ? `${NEWS_URL}?nocache=1` : NEWS_URL;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const normalized = normalizeNewsPayload(data);
      setNews(normalized);
      setLastFetched(normalized._cachedAt);
      saveCachedNews(normalized);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  // Fetch on mount + when the app comes back to focus (with a stale check)
  useEffect(() => {
    refresh.current();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && lastFetched) {
        const since = Date.now() - lastFetched;
        if (since > 5 * 60 * 1000) refresh.current();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return {
    news,
    loading,
    error,
    refresh: (force) => refresh.current(force),
    lastFetched,
  };
};

// Does an article mention a game in the user's library? Used to add a small
// "in your library" star to relevant headlines. Strips punctuation when
// comparing so "007: First Light" matches "007 First Light", and
// "Spider-Man" matches "Spider Man".
const normalizeForMatch = (s) =>
  (s || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

const matchLibraryGame = (article, games) => {
  if (!article || !games || games.length === 0) return null;
  const haystack = normalizeForMatch(`${article.title || ''} ${article.excerpt || ''}`);
  // Sort by title length descending so "Super Mario Bros." matches before "Mario"
  const sorted = [...games].sort((a, b) => b.title.length - a.title.length);
  for (const g of sorted) {
    if (!g.title) continue;
    const needle = normalizeForMatch(g.title);
    if (needle.length < 4) continue;
    if (haystack.includes(needle)) return g;
  }
  return null;
};

// Dismissed banners persist across sessions; key lives in data/config.js.
const loadDismissed = () => {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')); }
  catch { return new Set(); }
};
const saveDismissed = (set) => {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set])); } catch {}
};

const SOURCE_COLORS = {
  'Nintendo Life':       '#dc2626',
  'PlayStation Blog':    '#3b82f6',
  'Polygon':             '#a855f7',
  'IGN':                 '#ef4444',
  'Engadget':            '#10b981',
  'Kotaku':              '#f59e0b',
};

const timeAgo = (iso) => {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

// Parse a YYYY-MM-DD string as LOCAL midnight (not UTC) so we don't lose a
// day to timezone offsets.
const parseLocalDate = (iso) => {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date(iso);
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
};

// "TODAY" / "YESTERDAY" / "2 DAYS AGO" / "MAY 23"
const freshnessLabel = (iso) => {
  if (!iso) return '';
  const d = parseLocalDate(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.floor((today.getTime() - that.getTime()) / 86400000);
  if (days < 0) return 'UPCOMING';
  if (days === 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  if (days < 7) return `${days} DAYS AGO`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
};

const freshnessPulse = (iso) => {
  const d = parseLocalDate(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.floor((today.getTime() - that.getTime()) / 86400000);
  if (days <= 0) return '#22c55e'; // bright green — fresh today
  if (days === 1) return '#e2b878'; // gold — yesterday
  return '#71717a';                 // muted — older
};

const shortDate = (iso) => parseLocalDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// =============================================================================
// EVENT BANNER (Nintendo Direct / Sony State of Play)
// =============================================================================
const EventBanner = ({ event, onDismiss }) => {
  const palette = event.type === 'nintendo'
    ? { from: '#7f1d1d', to: '#1c1917', label: 'NINTENDO' }
    : { from: '#1e3a8a', to: '#0f172a', label: 'PLAYSTATION' };
  return (
    <div
      className="mx-4 mt-3 rounded-2xl overflow-hidden grain relative"
      style={{ background: `linear-gradient(135deg, ${palette.from} 0%, ${palette.to} 100%)` }}
    >
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] font-medium" style={{ color: event.accent }}>
            {palette.label}
          </div>
          <div className="serif text-[20px] text-white leading-tight mt-0.5">{event.title}</div>
          <div className="text-[12px] text-zinc-300 mt-1 tabular-nums">
            {event.date} · {event.time}
          </div>
        </div>
        <button
          onClick={() => onDismiss(event.id)}
          className="glass-light rounded-full p-2 shrink-0"
          aria-label="Dismiss"
        >
          <Icon name="close" className="w-4 h-4 text-zinc-300" />
        </button>
      </div>
    </div>
  );
};

// =============================================================================
// PODCAST CARD
// =============================================================================
const PodcastCard = ({ pod, onPlay, onViewAll }) => {
  // Graceful fallback if the Worker temporarily returns no episodes
  if (!pod.episodes || pod.episodes.length === 0) {
    return (
      <div className="mx-4 mt-3 glass rounded-2xl p-4 text-sm text-zinc-500">
        No recent episodes for <span className="text-zinc-300">{pod.show}</span> yet.
      </div>
    );
  }
  const latest = pod.episodes[0];
  const previous = pod.episodes.slice(1);
  const pulseColor = freshnessPulse(latest.date);
  const freshLabel = freshnessLabel(latest.date);
  return (
    <div className="mx-4 mt-3 glass rounded-2xl overflow-hidden">
      <div className="flex">
        <div className="w-24 shrink-0 grain" style={{ background: pod.coverGradient }}>
          <div className="h-full flex items-center justify-center text-3xl">🎙️</div>
        </div>
        <div className="flex-1 min-w-0 p-3.5">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: pulseColor }} />
            <div className="text-[10px] uppercase tracking-[0.18em] font-medium" style={{ color: pulseColor }}>
              {freshLabel}
            </div>
          </div>
          <div className="serif text-[16px] text-white leading-tight mt-1 line-clamp-2">{latest.title}</div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium mt-1.5">{pod.show}</div>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={(e) => { e.stopPropagation(); onPlay(pod, latest); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-ink-950 text-[11px] font-semibold"
            >
              <Icon name="play" className="w-3 h-3" filled />
              Play
            </button>
            {latest.duration && (
              <span className="text-[11px] text-zinc-500 tabular-nums ml-auto">{latest.duration}</span>
            )}
          </div>
        </div>
      </div>
      {previous.length > 0 && (
        <button
          onClick={() => onViewAll(pod)}
          className="w-full border-t border-white/5 px-4 py-2.5 flex items-center justify-between hover:bg-white/5 active:bg-white/10 transition-colors"
        >
          <span className="text-[12px] text-zinc-300">
            View {previous.length} previous episode{previous.length === 1 ? '' : 's'}
          </span>
          <span className="text-zinc-500 text-[16px] leading-none">→</span>
        </button>
      )}
    </div>
  );
};

// =============================================================================
// PODCAST EPISODE LIST SHEET — shows the back catalog with titles + dates
// =============================================================================
const PodcastListSheet = ({ open, pod, onClose, onPlay }) => {
  if (!open || !pod) return null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={pod.show}
      leftAction={<button onClick={onClose} className="text-zinc-400 text-[14px]">Close</button>}
    >
      <div className="px-4 pt-4 pb-8">
        {/* Hero strip */}
        <div className="rounded-2xl overflow-hidden grain h-24 flex items-end p-4 mb-4" style={{ background: pod.coverGradient }}>
          <div className="text-3xl drop-shadow-lg">🎙️</div>
        </div>

        <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium mb-3">
          Recent episodes
        </div>

        <div className="space-y-2.5">
          {pod.episodes.map(ep => {
            const pulse = freshnessPulse(ep.date);
            const fresh = freshnessLabel(ep.date);
            return (
              <div key={ep.date} className="glass rounded-2xl p-3.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: pulse }} />
                  <div className="text-[10px] uppercase tracking-[0.18em] font-medium" style={{ color: pulse }}>
                    {fresh}
                  </div>
                  <span className="text-[10px] text-zinc-500 ml-auto tabular-nums">{shortDate(ep.date)} · {ep.duration}</span>
                </div>
                <div className="serif text-[15px] text-white leading-snug">{ep.title}</div>
                <div className="flex items-center gap-2 mt-2.5">
                  <button
                    onClick={() => onPlay(pod, ep)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-ink-950 text-[11px] font-semibold"
                  >
                    <Icon name="play" className="w-3 h-3" filled />
                    Play
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
};

// =============================================================================
// IN-APP YOUTUBE PLAYER
// Renders ONE stable YouTube iframe at the App level, kept alive across mode
// changes by positioning a single fixed iframe over a measured "slot" in the
// expanded sheet (or off-screen in mini). Expanded mode is a bottom sheet with
// a tappable scrim (tap → collapse to mini), custom transport (±15s, scrubber,
// play/pause), and a scrollable chapter list parsed from the video description.
// Media Session handlers are best-effort; note that iOS Safari/PWA does NOT
// keep a YouTube iframe playing once the screen locks — that's a platform wall.
// =============================================================================
const extractYouTubeId = (url) => {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
};

const formatPlayerTime = (s) => {
  if (!isFinite(s) || s < 0) return '0:00';
  const total = Math.floor(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

// Parse chapter timestamps out of a YouTube video description. Matches lines
// that start with a timestamp (m:ss / mm:ss / h:mm:ss), optionally wrapped in
// parens, followed by a label. Needs ≥2 to count as a real chapter list.
const parseChapters = (description) => {
  if (!description) return [];
  const out = [];
  for (const rawLine of description.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = line.match(/^\(?(\d{1,2}):(\d{2})(?::(\d{2}))?\)?\s*[-–—:.)\]]*\s*(\S.*)$/);
    if (!m) continue;
    let secs;
    if (m[3] !== undefined) secs = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
    else secs = (+m[1]) * 60 + (+m[2]);
    const label = m[4].trim().replace(/\s{2,}/g, ' ');
    if (label) out.push({ time: secs, label });
  }
  // De-dup by timestamp (keep first), sort ascending
  const seen = new Set();
  const deduped = out.filter(c => (seen.has(c.time) ? false : seen.add(c.time)));
  deduped.sort((a, b) => a.time - b.time);
  return deduped.length >= 2 ? deduped.slice(0, 80) : [];
};

// Loads the YouTube IFrame API exactly once; returns a promise that resolves
// when window.YT.Player is callable.
let ytApiPromise = null;
const loadYouTubeApi = () => {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve();
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.id = 'yt-iframe-api';
    document.body.appendChild(tag);
    // YouTube calls onYouTubeIframeAPIReady globally
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve();
    };
  });
  return ytApiPromise;
};

const SKIP_SECONDS = 15;

const PodcastPlayer = ({ playing, mode, onMinimize, onExpand, onClose }) => {
  const hostRef = useRef(null);     // div YouTube mounts its iframe into
  const playerRef = useRef(null);   // YT.Player instance
  const sheetRef = useRef(null);    // expanded sheet container (for ResizeObserver)
  const slotRef = useRef(null);     // placeholder the iframe is positioned over
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [error, setError] = useState(null);
  const [slotRect, setSlotRect] = useState(null);

  const videoId = playing ? extractYouTubeId(playing.episode.youtubeUrl) : null;
  const chapters = useMemo(
    () => parseChapters(playing?.episode?.description),
    [playing]
  );
  // Index of the chapter currently playing (last chapter whose time <= now)
  const activeChapterIdx = useMemo(() => {
    if (chapters.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < chapters.length; i++) {
      if (currentTime + 0.5 >= chapters[i].time) idx = i; else break;
    }
    return idx;
  }, [chapters, currentTime]);

  // Create or update the YouTube player whenever the playing item changes
  useEffect(() => {
    if (!playing || !videoId) return;
    let cancelled = false;
    setError(null);

    loadYouTubeApi().then(() => {
      if (cancelled || !hostRef.current) return;
      if (playerRef.current && playerRef.current.loadVideoById) {
        try { playerRef.current.loadVideoById(videoId); } catch { /* ignore */ }
        return;
      }
      playerRef.current = new window.YT.Player(hostRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
        },
        events: {
          onReady: (e) => {
            if (cancelled) return;
            setIsReady(true);
            setDuration(e.target.getDuration() || 0);
            try { e.target.playVideo(); } catch {}
          },
          onStateChange: (e) => {
            // YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
            const s = e.data;
            setIsPlaying(s === 1);
            if (s === 1 || s === 2) {
              const d = e.target.getDuration() || 0;
              if (d && Math.abs(d - duration) > 0.5) setDuration(d);
            }
          },
          onError: () => setError('This video can\'t be embedded.'),
        },
      });
    });

    return () => { cancelled = true; };
  }, [videoId]);

  // Poll currentTime so the scrubber + active chapter stay live
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p || !p.getCurrentTime || scrubbing) return;
      const t = p.getCurrentTime();
      if (typeof t === 'number') setCurrentTime(t);
      const d = p.getDuration();
      if (d && Math.abs(d - duration) > 0.5) setDuration(d);
    }, 500);
    return () => clearInterval(id);
  }, [isReady, scrubbing, duration]);

  // Measure the video slot so the fixed iframe can be positioned over it.
  // Re-measures when the sheet resizes (e.g. chapters render and the
  // bottom-anchored sheet grows upward, shifting the slot's top).
  //
  // CRITICAL: the ResizeObserver callback is coalesced to one rAF and the
  // setState bails when the rect is unchanged. Without this, a ResizeObserver
  // → setState → re-render → (scrollbar/layout settle) → ResizeObserver cycle
  // can run away and saturate the main thread, which is what made the app go
  // sluggish/unresponsive after a while in the player.
  useEffect(() => {
    if (mode !== 'expanded') { setSlotRect(null); return; }
    let rafId = null;
    const apply = () => {
      rafId = null;
      if (!slotRef.current) return;
      const r = slotRef.current.getBoundingClientRect();
      setSlotRect(prev => (
        prev &&
        Math.abs(prev.top - r.top) < 0.5 &&
        Math.abs(prev.left - r.left) < 0.5 &&
        Math.abs(prev.width - r.width) < 0.5 &&
        Math.abs(prev.height - r.height) < 0.5
      ) ? prev : { top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const schedule = () => { if (rafId == null) rafId = requestAnimationFrame(apply); };
    schedule();
    const ro = new ResizeObserver(schedule);
    if (sheetRef.current) ro.observe(sheetRef.current);
    window.addEventListener('resize', schedule);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [mode, chapters.length, playing]);

  const skip = (delta) => {
    const p = playerRef.current;
    if (!p || !p.getCurrentTime) return;
    const t = (p.getCurrentTime() || 0) + delta;
    const next = Math.max(0, Math.min(t, duration || t));
    p.seekTo(next, true);
    setCurrentTime(next);
  };
  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    if (isPlaying) p.pauseVideo?.();
    else p.playVideo?.();
  };
  // Stable identity so the memoized chapter list doesn't re-render every poll.
  const seekTo = useCallback((t) => {
    playerRef.current?.seekTo?.(t, true);
    playerRef.current?.playVideo?.();
    setCurrentTime(t);
  }, []);

  // YouTube watch URL anchored to a given second, so "Open in YouTube"
  // resumes from wherever you currently are in the episode.
  const youtubeUrlAt = (secs) => {
    const id = extractYouTubeId(playing?.episode?.youtubeUrl);
    const t = Math.max(0, Math.floor(secs || 0));
    return id ? `https://www.youtube.com/watch?v=${id}&t=${t}s` : (playing?.episode?.youtubeUrl || '#');
  };

  // Memoized chapter rows — depends only on chapters + which one is active,
  // NOT on currentTime, so the list isn't rebuilt on every 500ms poll.
  const chapterRows = useMemo(() => chapters.map((c, i) => {
    const active = i === activeChapterIdx;
    return (
      <button
        key={`${c.time}-${i}`}
        onClick={() => seekTo(c.time)}
        className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-colors ${active ? 'bg-white/10' : 'hover:bg-white/5 active:bg-white/10'}`}
      >
        <span
          className="text-[11px] tabular-nums font-semibold shrink-0 w-12"
          style={{ color: active ? '#e2b878' : '#71717a' }}
        >
          {formatPlayerTime(c.time)}
        </span>
        <span className={`text-[13px] leading-snug ${active ? 'text-white' : 'text-zinc-300'} line-clamp-2`}>
          {c.label}
        </span>
      </button>
    );
  }), [chapters, activeChapterIdx, seekTo]);

  // Media Session API — best effort. iOS uses 10s seek offsets on the
  // lockscreen, so we mirror that here (the in-app buttons stay at 15s).
  useEffect(() => {
    if (!playing || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: playing.episode.title || 'Podcast',
        artist: playing.pod.show || 'Kinda Funny',
        artwork: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      });
      navigator.mediaSession.setActionHandler('play', () => playerRef.current?.playVideo?.());
      navigator.mediaSession.setActionHandler('pause', () => playerRef.current?.pauseVideo?.());
      navigator.mediaSession.setActionHandler('seekbackward', (d) => skip(-(d.seekOffset || 10)));
      navigator.mediaSession.setActionHandler('seekforward', (d) => skip(d.seekOffset || 10));
      navigator.mediaSession.setActionHandler('previoustrack', () => skip(-10));
      navigator.mediaSession.setActionHandler('nexttrack', () => skip(10));
    } catch { /* unsupported in some browsers */ }
  }, [playing]);

  // Sync media session playback state + position so iOS shows the right info
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try { navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'; } catch {}
    try {
      if (duration > 0 && navigator.mediaSession.setPositionState) {
        navigator.mediaSession.setPositionState({
          duration,
          position: Math.min(currentTime, duration),
          playbackRate: 1,
        });
      }
    } catch { /* setPositionState can throw on bad values */ }
  }, [isPlaying, currentTime, duration]);

  // Tear down the player when nothing's loaded
  useEffect(() => {
    if (playing) return;
    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch {}
      playerRef.current = null;
      setIsReady(false);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [playing]);

  if (!playing) return null;

  return (
    <>
      {/* Stable iframe — a single fixed element positioned over the sheet's
          slot when expanded, parked off-screen (audio continues) when mini.
          Horizontal size/centering is pure CSS (matches the sheet's slot,
          which is max-w-md minus mx-4) so it can't overflow on iOS, where a
          measured-pixel width diverges from layout. Only the vertical `top`
          is measured. pointer-events stay ON so YouTube taps (play/pause)
          work. */}
      <div
        className="fixed"
        style={mode === 'expanded' && slotRect ? {
          top: slotRect.top,
          left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto',
          width: 'min(calc(100vw - 32px), 416px)',
          height: 'calc(min(100vw - 32px, 416px) * 0.5625)',
          zIndex: 55,
        } : {
          left: '-10000px', top: 0, width: 1, height: 1, overflow: 'hidden', zIndex: -1,
        }}
      >
        <div className="w-full h-full bg-black rounded-2xl overflow-hidden">
          <div ref={hostRef} className="w-full h-full" />
        </div>
      </div>

      {/* EXPANDED — bottom sheet + scrim. Tap scrim to collapse to mini. */}
      {mode === 'expanded' && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            onClick={onMinimize}
            aria-label="Collapse player"
          />
          <div
            ref={sheetRef}
            className="fixed bottom-0 inset-x-0 z-50 max-w-md mx-auto bg-ink-950 rounded-t-3xl border-t border-white/10 flex flex-col"
            style={{ maxHeight: '92vh' }}
          >
            {/* Drag handle — tap to collapse */}
            <button onClick={onMinimize} className="flex justify-center pt-2.5 pb-1 shrink-0 w-full" aria-label="Collapse player">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </button>

            {/* Header */}
            <div className="flex items-center justify-between px-3 pb-2 shrink-0">
              <button onClick={onMinimize} className="glass-light rounded-full p-2" aria-label="Minimize">
                <Icon name="arrowDown" className="w-5 h-5 text-zinc-300" />
              </button>
              <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                Now playing
              </div>
              <button onClick={onClose} className="glass-light rounded-full p-2" aria-label="Close player">
                <Icon name="close" className="w-5 h-5 text-zinc-300" />
              </button>
            </div>

            {/* Video slot — the fixed iframe is positioned exactly over this */}
            <div ref={slotRef} className="mx-4 rounded-2xl bg-black shrink-0" style={{ aspectRatio: '16 / 9' }} />

            {/* Title + show */}
            <div className="px-5 mt-3 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.18em] font-medium" style={{ color: playing.pod.accent || '#d4a574' }}>
                  {playing.pod.show}
                </div>
                <a
                  href={youtubeUrlAt(currentTime)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Rewrite href just-in-time from the player's live position
                    // so it always resumes from exactly where you are now.
                    const live = playerRef.current?.getCurrentTime?.();
                    e.currentTarget.href = youtubeUrlAt(typeof live === 'number' ? live : currentTime);
                  }}
                  className="flex items-center gap-1 shrink-0 glass-light rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider text-zinc-300 font-medium"
                >
                  YouTube ↗
                </a>
              </div>
              <h2 className="serif text-[19px] leading-tight text-white mt-1 line-clamp-2">{playing.episode.title}</h2>
              {error && <div className="text-[12px] text-rose-300/80 mt-2">{error}</div>}
            </div>

            {/* Scrubber */}
            <div className="px-5 mt-3 shrink-0">
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.5}
                value={currentTime}
                onChange={(e) => { setScrubbing(true); setCurrentTime(parseFloat(e.target.value)); }}
                onMouseUp={(e) => { seekTo(parseFloat(e.target.value)); setScrubbing(false); }}
                onTouchEnd={(e) => { seekTo(parseFloat(e.target.value)); setScrubbing(false); }}
                className="w-full"
                style={{ accentColor: '#e2b878' }}
              />
              <div className="flex justify-between text-[11px] text-zinc-500 tabular-nums mt-1">
                <span>{formatPlayerTime(currentTime)}</span>
                <span>{formatPlayerTime(duration)}</span>
              </div>
            </div>

            {/* Transport controls */}
            <div className="mt-3 mb-1 flex items-center justify-center gap-10 shrink-0">
              <button onClick={() => skip(-SKIP_SECONDS)} className="text-zinc-200 active:scale-95 transition-transform" aria-label="Back 15 seconds">
                <Icon name="skipBack15" className="w-9 h-9" />
              </button>
              <button
                onClick={togglePlay}
                className="bg-white text-ink-950 rounded-full w-14 h-14 flex items-center justify-center active:scale-95 transition-transform"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} className="w-6 h-6" filled />
              </button>
              <button onClick={() => skip(SKIP_SECONDS)} className="text-zinc-200 active:scale-95 transition-transform" aria-label="Forward 15 seconds">
                <Icon name="skipForward15" className="w-9 h-9" />
              </button>
            </div>

            {/* Chapters — own scroll container so it never pushes controls up */}
            {chapters.length > 0 && (
              <div className="mt-2 flex flex-col min-h-0 flex-1">
                <div className="px-5 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium shrink-0 mb-1.5">
                  Chapters
                </div>
                <div className="overflow-y-auto overscroll-contain px-3 pb-4">
                  {chapterRows}
                </div>
              </div>
            )}

            {/* Bottom safe-area padding when there are no chapters to fill it */}
            {chapters.length === 0 && <div className="pb-6 shrink-0" />}
          </div>
        </>
      )}

      {/* MINI BAR — pinned to the bottom safe area while iframe plays off-screen */}
      {mode === 'mini' && (
        <div className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
          <div className="max-w-md mx-auto pb-safe">
            <div
              className="mx-3 mb-3 glass rounded-2xl flex items-center gap-3 p-2 pointer-events-auto cursor-pointer"
              onClick={onExpand}
              role="button"
              aria-label="Expand player"
            >
              <div
                className="w-11 h-11 rounded-xl overflow-hidden shrink-0 grain flex items-center justify-center text-xl"
                style={{ background: playing.pod.coverGradient }}
              >
                🎙️
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-white truncate leading-tight">{playing.episode.title}</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium truncate mt-0.5">
                  {playing.pod.show} · {formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className="bg-white text-ink-950 rounded-full w-9 h-9 flex items-center justify-center shrink-0"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} className="w-4 h-4" filled />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className="p-2 rounded-full shrink-0"
                aria-label="Close player"
              >
                <Icon name="close" className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// =============================================================================
// HEADLINE CARD
// =============================================================================
const HeadlineCard = ({ article, onOpen, libraryMatch, isRead }) => {
  const sourceColor = SOURCE_COLORS[article.source] || '#a1a1aa';
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = article.coverImage && !imageFailed;
  return (
    <button
      onClick={() => onOpen(article)}
      className={`w-full text-left p-3 flex items-start gap-3 hover:bg-white/5 active:bg-white/10 transition-colors ${isRead ? 'opacity-45' : ''}`}
    >
      <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0" style={{ background: showImage ? '#0a0a0c' : `${sourceColor}26` /* ~15% alpha */ }}>
        {showImage ? (
          <img
            src={article.coverImage}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl select-none">🎮</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: sourceColor }}>
            {article.source}
          </span>
          <span className="text-[10px] text-zinc-500 tabular-nums">·</span>
          <span className="text-[10px] text-zinc-500 tabular-nums">{timeAgo(article.publishedAt)}</span>
          {libraryMatch && (
            <span title={`In your library: ${libraryMatch.title}`} className="ml-1 flex items-center">
              <Icon name="star" filled className="w-3 h-3" style={{ color: '#e2b878' }} />
            </span>
          )}
          {isRead && (
            <span className="ml-1 text-[9px] uppercase tracking-wider text-zinc-600 font-semibold">Read</span>
          )}
        </div>
        <div className="serif text-[15px] text-white leading-snug mt-0.5 line-clamp-2">{article.title}</div>
        <div className="text-[12px] text-zinc-400 mt-1 line-clamp-2 leading-snug">{article.excerpt}</div>
      </div>
    </button>
  );
};

// =============================================================================
// NEWS FILTER CHIPS
// =============================================================================
const NEWS_FILTERS = [
  { id: 'all',         label: 'All' },
  { id: 'library',     label: 'In Library' },
  { id: 'nintendo',    label: 'Nintendo' },
  { id: 'playstation', label: 'PlayStation' },
  { id: 'review',      label: 'Reviews' },
  { id: 'upcoming',    label: 'Upcoming' },
  { id: 'hardware',    label: 'Hardware' },
];

const NewsFilters = ({ active, onChange }) => (
  <div className="px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar">
    {NEWS_FILTERS.map(f => {
      const on = active === f.id;
      return (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
            on ? 'bg-white text-ink-950' : 'glass-light text-zinc-300'
          }`}
        >
          {f.label}
        </button>
      );
    })}
  </div>
);

// =============================================================================
// ARTICLE READER SHEET — fetches the full article body via the worker.
// (Podcast playback is handled by PodcastPlayer; this sheet is articles only.)
// =============================================================================
const ReaderSheet = ({ open, item, onClose, onMarkRead }) => {
  const [article, setArticle] = useState(null);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [articleError, setArticleError] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (!open || !item?.url) return;
    setLoadingArticle(true);
    setArticle(null);
    setArticleError(null);
    setImageFailed(false);
    fetch(ARTICLE_URL(item.url))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setArticle(data);
      })
      .catch((e) => setArticleError(e.message || String(e)))
      .finally(() => setLoadingArticle(false));
  }, [open, item]);

  if (!open || !item) return null;
  const sourceColor = SOURCE_COLORS[item.source] || '#a1a1aa';
  const hero = article?.heroImage || item.coverImage;
  const showHero = hero && !imageFailed;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Article"
      leftAction={<button onClick={onClose} className="text-zinc-400 text-[14px]">Close</button>}
      rightAction={
        <button
          onClick={() => { onMarkRead?.(articleKey(item)); onClose(); }}
          className="text-[14px] font-semibold"
          style={{ color: '#d4a574' }}
        >
          Mark read
        </button>
      }
    >
      <div className="px-4 py-6">
        {showHero ? (
          <div className="rounded-2xl overflow-hidden mb-4 aspect-[16/9]" style={{ background: '#0a0a0c' }}>
            <img
              src={hero}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setImageFailed(true)}
            />
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden mb-4 aspect-[16/9] flex items-center justify-center text-6xl"
               style={{ background: `${sourceColor}26` }}>
            🎮
          </div>
        )}
        <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: sourceColor }}>
          {item.source} · {timeAgo(item.publishedAt)}
        </div>
        <h2 className="serif text-[26px] leading-tight text-white mt-2">{item.title}</h2>
        {article?.byline && (
          <div className="text-[12px] text-zinc-500 mt-2">By {article.byline}</div>
        )}

        {loadingArticle && (
          <div className="mt-6 space-y-3 animate-pulse">
            <div className="h-3 w-full bg-white/5 rounded" />
            <div className="h-3 w-11/12 bg-white/5 rounded" />
            <div className="h-3 w-10/12 bg-white/5 rounded" />
            <div className="h-3 w-9/12 bg-white/5 rounded" />
          </div>
        )}

        {articleError && (
          <div className="mt-6 glass rounded-2xl p-4">
            <p className="text-sm text-zinc-400 leading-relaxed">
              Couldn't load the article body. Here's the excerpt:
            </p>
            <p className="text-zinc-300 mt-3 leading-relaxed">{item.excerpt}</p>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-[13px] font-semibold"
              style={{ color: '#d4a574' }}
            >
              Read on {item.source} →
            </a>
          </div>
        )}

        {article?.content && (
          <div
            className="article-body mt-5"
            dangerouslySetInnerHTML={{ __html: article.content }}
          />
        )}

        {article && !article.content && !loadingArticle && !articleError && (
          <div className="mt-6 glass rounded-2xl p-4">
            <p className="text-zinc-300 leading-relaxed">{item.excerpt}</p>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-[13px] font-semibold"
              style={{ color: '#d4a574' }}
            >
              Read full article on {item.source} →
            </a>
          </div>
        )}

        {article?.content && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-block text-[12px] text-zinc-500 hover:text-zinc-300"
          >
            View original on {item.source} →
          </a>
        )}
      </div>
    </Sheet>
  );
};

// =============================================================================
// NEWS SCREEN
// =============================================================================
// =============================================================================
// STATS SCREEN — pure local computation across the user's library.
// All charts are hand-rolled SVG (no external lib) to keep the bundle clean.
// =============================================================================
const StatsScreen = ({ games, tab, onTabChange }) => {
  const stats = useMemo(() => computeStats(games), [games]);

  return (
    <div className="screen-enter pt-safe pb-32">
      <div className="px-4 pt-5 pb-1">
        <TitleNav active={tab} onChange={onTabChange} />
      </div>

      {/* Hero numbers */}
      <div className="px-4 mt-5 grid grid-cols-2 gap-3">
        <StatTile label="Played" value={stats.totalPlayed} sub={stats.totalRated > 0 ? `${stats.totalRated} rated` : null} />
        <StatTile label="Lifetime hours" value={stats.totalHours > 0 ? stats.totalHours.toLocaleString() : '—'} sub={stats.totalHours > 0 ? 'from RAWG' : 'no data yet'} />
      </div>

      {/* Score vs. release year — stacked bars per year */}
      <SectionCard title="Score vs. release year" subtitle="Tier breakdown of played games released 2017+">
        <TierLegend />
        <TierStackedBar rows={stats.byYearTiers} labelWidth="3rem" />
      </SectionCard>

      {/* Score vs. system — stacked bars per platform */}
      <SectionCard title="Score vs. system" subtitle="Tier breakdown of played games by platform">
        <TierLegend />
        <TierStackedBar rows={stats.byPlatformTiers} labelWidth="5rem" />
      </SectionCard>

      {/* Top franchises — series with 2+ games, sortable by count or score */}
      <SectionCard title="Top franchises" subtitle="Series with 2 or more games in your library">
        <TopFranchises rows={stats.topFranchises} />
      </SectionCard>

      {/* What you value — predictiveness spider */}
      <SectionCard title="What you value" subtitle="Categories that distinguish Masterpieces from other Top 50 games">
        <PredictivenessRadar
          predictiveness={stats.predictiveness}
          masterpiecesCount={stats.masterpiecesCount}
          otherCount={stats.otherTop50Count}
        />
      </SectionCard>

      {/* Completion */}
      <SectionCard title="Completion" subtitle={`${stats.totalRated} rated games`}>
        <CompletionBars completion={stats.completion} totalRated={stats.totalRated} />
      </SectionCard>

      {stats.totalPlayed === 0 && (
        <div className="mx-4 mt-6 glass rounded-2xl p-6 text-center text-zinc-400 text-sm">
          Rate some games to start filling your Stats page.
        </div>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Stats computation
// -----------------------------------------------------------------------------
// Franchise rules — title-prefix regexes that bucket games into series. Order
// matters: more specific patterns first so e.g. "Mario Kart" wins over "Mario".
const FRANCHISE_RULES = [
  { match: /^pok[eé]mon\b|^pokopia\b|^new pok[eé]mon\b/i,                                                label: 'Pokémon' },
  { match: /^(the )?(legend of )?zelda\b|^zelda:|^hyrule warriors\b|^a link to the past\b/i,             label: 'Zelda' },
  { match: /^super smash bros/i,                                                                         label: 'Smash Bros.' },
  { match: /^mario kart\b/i,                                                                             label: 'Mario Kart' },
  { match: /^(super |new super )?mario\b|^paper mario\b|^mario party\b|^3d mario\b|^luigi'?s mansion\b/i, label: 'Mario' },
  { match: /^god of war\b/i,                                                                             label: 'God of War' },
  { match: /^spider-?man\b/i,                                                                            label: 'Spider-Man' },
  { match: /^the last of us\b/i,                                                                         label: 'The Last of Us' },
  { match: /^uncharted\b/i,                                                                              label: 'Uncharted' },
  { match: /^grand theft auto\b|^gta\b/i,                                                                label: 'Grand Theft Auto' },
  { match: /^red dead\b/i,                                                                               label: 'Red Dead' },
  { match: /^final fantasy\b/i,                                                                          label: 'Final Fantasy' },
  { match: /^assassin'?s creed\b/i,                                                                      label: "Assassin's Creed" },
  { match: /^dark souls\b/i,                                                                             label: 'Dark Souls' },
  { match: /^mass effect\b/i,                                                                            label: 'Mass Effect' },
  { match: /^metroid\b/i,                                                                                label: 'Metroid' },
  { match: /^kingdom hearts\b/i,                                                                         label: 'Kingdom Hearts' },
  { match: /^persona\b/i,                                                                                label: 'Persona' },
  { match: /^resident evil\b/i,                                                                          label: 'Resident Evil' },
  { match: /^splatoon\b/i,                                                                               label: 'Splatoon' },
  { match: /^hollow knight\b/i,                                                                          label: 'Hollow Knight' },
  { match: /^horizon\b/i,                                                                                label: 'Horizon' },
  { match: /^(the )?witcher\b/i,                                                                         label: 'The Witcher' },
  { match: /^fire emblem\b/i,                                                                            label: 'Fire Emblem' },
  { match: /^donkey kong\b|^diddy kong\b/i,                                                              label: 'Donkey Kong' },
  { match: /^kirby\b/i,                                                                                  label: 'Kirby' },
  { match: /^ratchet (&|and) clank\b/i,                                                                  label: 'Ratchet & Clank' },
  { match: /^jak and daxter\b/i,                                                                         label: 'Jak and Daxter' },
  { match: /^(lego )?star wars\b/i,                                                                      label: 'Star Wars' },
  { match: /^tomb raider\b/i,                                                                            label: 'Tomb Raider' },
  { match: /^sonic\b|^shadow the hedgehog\b/i,                                                           label: 'Sonic' },
  { match: /^ghost of\b/i,                                                                               label: 'Ghost (Sucker Punch)' },
  { match: /^hellblade\b/i,                                                                              label: 'Hellblade' },
  { match: /^death stranding\b/i,                                                                        label: 'Death Stranding' },
  { match: /^black myth\b/i,                                                                             label: 'Black Myth' },
  { match: /^wario ?ware\b/i,                                                                            label: 'WarioWare' },
  { match: /^astro\b/i,                                                                                  label: 'Astro Bot' },
  { match: /^batman\b/i,                                                                                 label: 'Batman: Arkham' },
  { match: /^banjo\b/i,                                                                                  label: 'Banjo-Kazooie' },
  { match: /^star ?fox\b/i,                                                                              label: 'Star Fox' },
  { match: /^metal gear\b/i,                                                                             label: 'Metal Gear' },
  { match: /^bayonetta\b/i,                                                                              label: 'Bayonetta' },
  { match: /^hogwarts\b|^harry potter\b/i,                                                               label: 'Wizarding World' },
  { match: /^silent hill\b/i,                                                                            label: 'Silent Hill' },
  { match: /^tony hawk\b/i,                                                                              label: 'Tony Hawk' },
];

const franchiseOf = (game) => {
  const t = (game.title || '').trim();
  for (const r of FRANCHISE_RULES) if (r.match.test(t)) return r.label;
  return null;
};

// Bucket every played game into one of four bands:
//   Masterpiece (Top 50 + score ≥100), Amazing (Top 50 + 90-99),
//   Great (Top 50 + 80-89), Other (played but not in Top 50)
const tierOfGame = (g) => {
  if (g.topListRank == null) return 'Other';
  const t = g.rating?.total || 0;
  if (t >= 100) return 'Masterpiece';
  if (t >= 90)  return 'Amazing';
  if (t >= 80)  return 'Great';
  return 'Other';
};

const TIER_BAND_ORDER = ['Masterpiece', 'Amazing', 'Great', 'Other'];
const blankBands = () => ({ Masterpiece: 0, Amazing: 0, Great: 0, Other: 0 });

const computeStats = (games) => {
  const played = games.filter(g => g.state === 'played');
  const rated = played.filter(g => g.rating && g.rating.total != null);
  const top50 = games.filter(g => g.topListRank != null);

  // BY YEAR (2017 onward) — stacked tier counts
  const yearMap = {};
  played.forEach(g => {
    const y = primaryYear(g);
    if (!y || y < 2017) return;
    if (!yearMap[y]) yearMap[y] = { label: String(y), segments: blankBands(), total: 0 };
    yearMap[y].segments[tierOfGame(g)]++;
    yearMap[y].total++;
  });
  const byYearTiers = Object.values(yearMap)
    .sort((a, b) => parseInt(b.label, 10) - parseInt(a.label, 10));

  // BY PLATFORM — same stacked-tier shape, sorted by total desc
  const platformMap = {};
  played.forEach(g => {
    const p = primaryPlatform(g);
    if (!p) return;
    if (!platformMap[p]) platformMap[p] = { label: p, segments: blankBands(), total: 0 };
    platformMap[p].segments[tierOfGame(g)]++;
    platformMap[p].total++;
  });
  const byPlatformTiers = Object.values(platformMap).sort((a, b) => b.total - a.total);

  // TOP FRANCHISES — group played games by franchise, surface counts +
  // avg score + masterpiece count. Thumbnail picks the highest-scored game
  // that has a cover, falling back to the most-recent game.
  const franchiseMap = {};
  played.forEach(g => {
    const f = franchiseOf(g);
    if (!f) return;
    if (!franchiseMap[f]) {
      franchiseMap[f] = { label: f, count: 0, sumScore: 0, ratedCount: 0, masterpieces: 0, games: [] };
    }
    const row = franchiseMap[f];
    row.count++;
    row.games.push(g);
    if (g.rating?.total != null) {
      row.sumScore += g.rating.total;
      row.ratedCount++;
      if (g.rating.total >= 100) row.masterpieces++;
    }
  });
  Object.values(franchiseMap).forEach(row => {
    const withCover = row.games.filter(g => effectiveCover(g));
    const pool = withCover.length > 0 ? withCover : row.games;
    pool.sort((a, b) =>
      (b.rating?.total || 0) - (a.rating?.total || 0) ||
      (primaryYear(b) || 0) - (primaryYear(a) || 0)
    );
    row.recentGame = pool[0];
  });
  // Full franchise list (≥2 games); the component sorts + slices by the
  // selected mode (number of games vs. top score).
  const topFranchises = Object.values(franchiseMap)
    .filter(f => f.count >= 2) // single-game "franchises" aren't franchises
    .map(f => ({ ...f, avgScore: f.ratedCount > 0 ? f.sumScore / f.ratedCount : null }));

  // PREDICTIVENESS — for each rubric category, the lift in avg score
  // among Masterpieces vs. the rest of the Top 50. Positive = the category
  // distinguishes Masterpieces; ~0 = no signal; negative = anti-signal.
  const masterpieces = top50.filter(g => (g.rating?.total || 0) >= 100);
  const otherTop50 = top50.filter(g => (g.rating?.total || 0) < 100);
  const predictiveness = {};
  CATEGORIES.forEach(c => {
    if (masterpieces.length === 0 || otherTop50.length === 0) {
      predictiveness[c.key] = 0;
      return;
    }
    const masterAvg = masterpieces.reduce((acc, g) => acc + (g.rating[c.key] || 0), 0) / masterpieces.length;
    const otherAvg  = otherTop50.reduce((acc, g) => acc + (g.rating[c.key] || 0), 0) / otherTop50.length;
    predictiveness[c.key] = masterAvg - otherAvg;
  });

  // Completion stats (story / platinum / replayed)
  const completion = { story: 0, platinum: 0, replayed: 0 };
  rated.forEach(g => {
    if (g.completion?.story)    completion.story++;
    if (g.completion?.platinum) completion.platinum++;
    if (g.completion?.replayed) completion.replayed++;
  });

  const totalPlayed = played.length;
  const totalRated = rated.length;
  const totalHours = games
    .filter(g => g.rawgPlaytime && (g.state === 'played' || g.state === 'playing'))
    .reduce((acc, g) => acc + (g.rawgPlaytime || 0), 0);

  return {
    totalPlayed, totalRated, totalHours,
    byYearTiers, byPlatformTiers,
    topFranchises,
    predictiveness,
    masterpiecesCount: masterpieces.length,
    otherTop50Count: otherTop50.length,
    completion,
  };
};

// -----------------------------------------------------------------------------
// Small UI bits
// -----------------------------------------------------------------------------
const StatTile = ({ label, value, sub }) => (
  <div className="glass rounded-2xl p-4">
    <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">{label}</div>
    <div className="serif text-[36px] leading-none text-white mt-1 tabular-nums">{value}</div>
    {sub && <div className="text-[11px] text-zinc-500 mt-1.5">{sub}</div>}
  </div>
);

const SectionCard = ({ title, subtitle, children }) => (
  <div className="mx-4 mt-5">
    <div className="px-1 mb-2">
      <div className="serif text-[20px] text-white">{title}</div>
      {subtitle && <div className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</div>}
    </div>
    <div className="glass rounded-2xl p-4">
      {children}
    </div>
  </div>
);

// -----------------------------------------------------------------------------
// Tier-band stacked bars (used by Score-vs-year and Score-vs-system)
// -----------------------------------------------------------------------------
const TIER_BAND_COLORS = {
  Masterpiece: '#e2b878',
  Amazing:     '#a8b4c0',
  Great:       '#b87349',
  Other:       '#3f3f46',
};
const TIER_BAND_LABEL = {
  Masterpiece: 'Masterpiece',
  Amazing:     'Amazing',
  Great:       'Great',
  Other:       'Played',
};
const tierTextColor = (t) => t === 'Other' ? 'rgba(255,255,255,0.75)' : '#0a0a0c';

const TierLegend = () => (
  <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-3">
    {TIER_BAND_ORDER.map(t => (
      <div key={t} className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: TIER_BAND_COLORS[t] }} />
        <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">
          {TIER_BAND_LABEL[t]}
        </span>
      </div>
    ))}
  </div>
);

const TierStackedBar = ({ rows, labelWidth = '4ch' }) => {
  if (!rows || rows.length === 0) {
    return <div className="text-sm text-zinc-500 text-center py-2">No data yet.</div>;
  }
  const maxTotal = Math.max(1, ...rows.map(r => r.total));
  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-2.5">
          <div
            className="text-[11px] text-zinc-300 shrink-0 font-medium tabular-nums truncate"
            style={{ width: labelWidth }}
            title={r.label}
          >
            {r.label}
          </div>
          <div className="flex-1 h-5 rounded-md overflow-hidden flex bg-white/5">
            {TIER_BAND_ORDER.map(t => {
              const seg = r.segments[t] || 0;
              if (seg === 0) return null;
              return (
                <div
                  key={t}
                  className="flex items-center justify-center text-[10px] font-semibold tabular-nums"
                  style={{
                    width: `${(seg / maxTotal) * 100}%`,
                    background: TIER_BAND_COLORS[t],
                    color: tierTextColor(t),
                    minWidth: 16,
                  }}
                  title={`${TIER_BAND_LABEL[t]}: ${seg}`}
                >
                  {seg}
                </div>
              );
            })}
          </div>
          <div className="text-[11px] text-zinc-500 tabular-nums w-6 shrink-0 text-right">{r.total}</div>
        </div>
      ))}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Top franchises — vertical list with the most-recent game's cover as the
// franchise thumbnail, count + masterpiece count + average score.
// -----------------------------------------------------------------------------
const TopFranchises = ({ rows }) => {
  const [sort, setSort] = useState('overall'); // 'overall' | 'count' | 'score'

  const sorted = useMemo(() => {
    const list = [...(rows || [])];
    // Overall blends breadth + quality: a LOG-normalized game count against
    // the biggest franchise (0..1) and avg score on the 80–100 tier scale
    // (0..1), then averaged. Log (vs linear) count gives diminishing returns
    // — the first games matter most — so a 4-game/97 series clears a tiny
    // 2-game/100 one, while a big score gap can still let a smaller franchise
    // win (a 3-game/100 still beats a 6-game/95.8).
    const maxCount = Math.max(2, ...list.map(f => f.count));
    const overallScore = (f) => {
      const countNorm = Math.log(1 + f.count) / Math.log(1 + maxCount);
      const scoreNorm = f.avgScore != null ? Math.max(0, Math.min(1, (f.avgScore - 80) / 20)) : 0;
      return (countNorm + scoreNorm) / 2;
    };
    if (sort === 'overall') {
      list.sort((a, b) => overallScore(b) - overallScore(a) || b.count - a.count);
    } else if (sort === 'score') {
      list.sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1) || b.count - a.count);
    } else {
      list.sort((a, b) => b.count - a.count || (b.avgScore || 0) - (a.avgScore || 0));
    }
    return list.slice(0, 10);
  }, [rows, sort]);

  if (!rows || rows.length === 0) {
    return (
      <div className="text-sm text-zinc-500 text-center py-4">
        Need at least 2 games from the same franchise to surface a series here.
      </div>
    );
  }
  return (
    <div>
      {/* Sort toggle */}
      <div className="flex gap-1 glass-light rounded-full p-1 mb-3.5 text-[10px]">
        {[['overall', 'Overall'], ['count', 'Number of games'], ['score', 'Top score']].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setSort(v)}
            className={`flex-1 rounded-full px-2 py-1.5 font-medium tracking-wide transition-all whitespace-nowrap ${sort === v ? 'bg-white text-ink-950' : 'text-zinc-400'}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="space-y-2.5">
      {sorted.map(f => {
        const cover = effectiveCover(f.recentGame);
        const tier = f.avgScore != null ? TIER(f.avgScore) : null;
        return (
          <div key={f.label} className="flex items-center gap-3">
            <div
              className="w-10 h-14 rounded-md overflow-hidden shrink-0 grain"
              style={cover ? { background: '#0a0a0c' } : { background: gradientFor(f.recentGame) }}
            >
              {cover && <img src={cover} alt="" loading="lazy" className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="serif text-[15px] text-white truncate">{f.label}</div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mt-0.5">
                {f.count} game{f.count === 1 ? '' : 's'}
                {f.masterpieces > 0 && ` · ${f.masterpieces} masterpiece${f.masterpieces === 1 ? '' : 's'}`}
              </div>
            </div>
            {f.avgScore != null && (
              <div className="text-right shrink-0">
                <div className="text-[15px] font-semibold tabular-nums" style={{ color: tier.color }}>
                  {f.avgScore.toFixed(1)}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-medium">avg</div>
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// "What you value" predictiveness radar — for each rubric category, plots
// the lift (avg score among Masterpieces − avg among other Top 50). Max
// observed lift reaches the outer ring; 0 sits at center.
// -----------------------------------------------------------------------------
const PredictivenessRadar = ({ predictiveness, masterpiecesCount, otherCount }) => {
  if (masterpiecesCount === 0 || otherCount === 0) {
    return (
      <div className="text-sm text-zinc-500 text-center py-6">
        Need both Masterpieces and non-Masterpiece Top 50 games to compare.
      </div>
    );
  }
  const size = 320, padX = 64, padY = 18;
  const cx = size / 2, cy = size / 2;
  const radius = size * 0.32;
  const labelR = radius + size * 0.085;
  const N = CATEGORIES.length;
  const values = CATEGORIES.map(c => predictiveness[c.key] || 0);
  const maxLift = Math.max(0.01, ...values);

  const point = (i, norm) => {
    const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
    const r = (norm / 10) * radius;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  };

  const pts = CATEGORIES.map((c, i) => {
    const lift = predictiveness[c.key] || 0;
    const norm = Math.max(0, lift / maxLift) * 10;
    return point(i, norm);
  });
  const rings = [2, 4, 6, 8, 10];
  const color = '#e2b878';

  return (
    <svg viewBox={`${-padX} ${-padY} ${size + padX * 2} ${size + padY * 2}`} className="w-full h-auto">
      {rings.map(v => {
        const ringPts = Array.from({ length: N }, (_, i) => point(i, v));
        return (
          <polygon key={v} points={ringPts.map(p => p.join(',')).join(' ')} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        );
      })}
      {CATEGORIES.map((c, i) => {
        const [x, y] = point(i, 10);
        return <line key={c.key} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />;
      })}
      <polygon points={pts.map(p => p.join(',')).join(' ')} fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.5" fill={color} />)}
      {CATEGORIES.map((c, i) => {
        const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
        const lx = cx + Math.cos(angle) * labelR;
        const ly = cy + Math.sin(angle) * labelR;
        const anchor = Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : (Math.cos(angle) > 0 ? 'start' : 'end');
        const lift = predictiveness[c.key] || 0;
        const liftLabel = lift > 0 ? `+${lift.toFixed(1)}` : lift.toFixed(1);
        return (
          <g key={c.key}>
            <text x={lx} y={ly - 5} textAnchor={anchor} fontSize="10" fontFamily="Inter" fontWeight="500" letterSpacing="0.5" fill="rgba(255,255,255,0.5)" style={{ textTransform: 'uppercase' }}>
              {c.label}
            </text>
            <text x={lx} y={ly + 7} textAnchor={anchor} fontSize="11" fontFamily="Inter" fontWeight="600" fill={color}>
              {liftLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
};


// -----------------------------------------------------------------------------
// Completion bars (Story / Platinum / Replayed)
// -----------------------------------------------------------------------------
const CompletionBars = ({ completion, totalRated }) => {
  if (totalRated === 0) {
    return <div className="text-sm text-zinc-500 text-center py-2">No rated games yet.</div>;
  }
  const rows = [
    { key: 'story',    label: 'Story finished', icon: 'check' },
    { key: 'platinum', label: 'Platinum / 100%', icon: 'trophy' },
    { key: 'replayed', label: 'Replayed',        icon: 'replay' },
  ];
  return (
    <div className="space-y-3">
      {rows.map(({ key, label, icon }) => {
        const count = completion[key] || 0;
        const pct = (count / totalRated) * 100;
        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Icon name={icon} className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-[12px] uppercase tracking-wider text-zinc-300 font-medium">{label}</span>
              </div>
              <div className="text-[12px] text-zinc-300 tabular-nums">
                <span style={{ color: '#e2b878' }}>{count}</span>
                <span className="text-zinc-500"> / {totalRated} · {pct.toFixed(0)}%</span>
              </div>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#e2b878' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const NewsScreen = ({ games, onSelect, tab, onTabChange, onPlayEpisode }) => {
  const [dismissed, setDismissed] = useState(loadDismissed);
  const [filter, setFilter] = useState('all');
  const [reader, setReader] = useState(null);
  const [listPod, setListPod] = useState(null);
  const [readArticles, setReadArticles] = useState(loadRead);

  const markRead = (id) => {
    if (!id) return;
    setReadArticles(prev => {
      const next = new Set(prev);
      next.add(id);
      saveRead(next);
      return next;
    });
  };

  // Live feed from the Cloudflare Worker
  const { news, loading, error, refresh, lastFetched } = useNews();
  const headlines = news?.headlines || [];
  const podcasts = news?.podcasts || [];
  const eventBanners = news?.events || [];

  const dismiss = (id) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  };

  const visibleEvents = eventBanners.filter(e => !dismissed.has(e.id));

  const filtered = useMemo(() => {
    if (filter === 'all') return headlines;
    if (filter === 'library') return headlines.filter(a => matchLibraryGame(a, games));
    if (filter === 'nintendo') return headlines.filter(a => (a.platforms || []).includes('nintendo') || a.source === 'Nintendo Life');
    if (filter === 'playstation') return headlines.filter(a => (a.platforms || []).includes('playstation') || a.source === 'PlayStation Blog' || a.source === 'Push Square');
    return headlines.filter(a => a.category === filter);
  }, [filter, headlines, games]);

  // Play the latest/selected episode in the in-app player at App level.
  // The previous ReaderSheet podcast branch (an external-link CTA) is gone —
  // we now play the YouTube video inline with custom transport controls.
  const openPodcast = (pod, episode) => {
    onPlayEpisode?.(pod, episode || pod.episodes?.[0]);
    setListPod(null); // close the episode list if it was open
  };

  // Pull-to-refresh
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(null);
  const containerRef = useRef(null);

  const onTouchStart = (e) => {
    if (window.scrollY <= 0) touchStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e) => {
    if (touchStartY.current == null) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0 && window.scrollY <= 0) {
      setPull(Math.min(dy * 0.5, 80));
    }
  };
  const onTouchEnd = async () => {
    if (pull > 50) {
      setRefreshing(true);
      try { await refresh(true); } finally { setRefreshing(false); }
    }
    setPull(0);
    touchStartY.current = null;
  };

  const showFirstLoad = loading && headlines.length === 0;
  // Podcasts use a relative "TODAY / N DAYS AGO" label derived from the
  // cached episode's date. If the cache is stale, the "latest" cached
  // episode may no longer actually be the latest — showing it would briefly
  // mislabel a 5-day-old episode as the most recent. Skeleton instead.
  const cacheIsStale = !lastFetched || (Date.now() - lastFetched > NEWS_STALE_MS);
  const showPodcastSkeleton = loading && (podcasts.length === 0 || cacheIsStale);

  return (
    <div
      ref={containerRef}
      className="screen-enter pt-safe pb-32"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(pull > 8 || refreshing) && (
        <div
          className="flex items-center justify-center text-[11px] uppercase tracking-[0.2em] text-zinc-400 font-medium"
          style={{ height: refreshing ? 48 : pull, transition: refreshing ? 'height 200ms ease-out' : 'none' }}
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full bg-gold mr-2 ${refreshing || pull > 50 ? 'animate-pulse' : ''}`} />
          {refreshing ? 'Refreshing…' : pull > 50 ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}

      <div className="px-4 pt-5 pb-1">
        <TitleNav active={tab} onChange={onTabChange} />
      </div>

      {/* Stack of dismissible banners */}
      <RecentReleaseBanner games={games} onSelect={onSelect} dismissed={dismissed} onDismiss={dismiss} />
      {visibleEvents.map(e => (
        <EventBanner key={e.id} event={e} onDismiss={dismiss} />
      ))}

      {/* Podcasts */}
      <div className="px-5 mt-6 mb-1">
        <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium">Today's podcasts</div>
      </div>
      {showPodcastSkeleton ? (
        <SkeletonPodcast />
      ) : podcasts.length === 0 ? (
        <div className="mx-4 mt-3 glass rounded-2xl p-4 text-sm text-zinc-500">No podcast episodes yet.</div>
      ) : (
        podcasts.map(p => (
          <PodcastCard key={p.id} pod={p} onPlay={openPodcast} onViewAll={setListPod} />
        ))
      )}

      {/* Headlines */}
      <div className="px-5 mt-7 mb-1 flex items-baseline justify-between">
        <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium">Latest headlines</div>
        {lastFetched && (
          <div className="text-[10px] text-zinc-600 tabular-nums">
            Updated {timeAgo(new Date(lastFetched).toISOString())}
          </div>
        )}
      </div>
      <NewsFilters active={filter} onChange={setFilter} />
      <div className="mx-4 glass rounded-3xl overflow-hidden divide-y divide-white/5">
        {showFirstLoad ? (
          <SkeletonHeadlines />
        ) : error && headlines.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 text-sm">
            Couldn't load news right now. Pull down to retry.
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 text-sm">No headlines match that filter.</div>
        ) : (
          filtered.map(a => (
            <HeadlineCard
              key={a.id || a.url}
              article={a}
              onOpen={setReader}
              libraryMatch={matchLibraryGame(a, games)}
              isRead={readArticles.has(articleKey(a))}
            />
          ))
        )}
      </div>

      <PodcastListSheet
        open={!!listPod}
        pod={listPod}
        onClose={() => setListPod(null)}
        onPlay={openPodcast}
      />
      <ReaderSheet
        open={!!reader}
        item={reader}
        onClose={() => setReader(null)}
        onMarkRead={markRead}
      />
    </div>
  );
};

// Loading skeletons
const SkeletonPodcast = () => (
  <div className="mx-4 mt-3 glass rounded-2xl overflow-hidden animate-pulse">
    <div className="flex">
      <div className="w-24 h-28 shrink-0 bg-white/5" />
      <div className="flex-1 p-3.5 space-y-2">
        <div className="h-2.5 w-16 bg-white/5 rounded" />
        <div className="h-3 w-5/6 bg-white/8 rounded" />
        <div className="h-2 w-3/4 bg-white/5 rounded" />
        <div className="flex gap-2 mt-2">
          <div className="h-5 w-16 bg-white/5 rounded-full" />
          <div className="h-5 w-16 bg-white/5 rounded-full" />
        </div>
      </div>
    </div>
  </div>
);
const SkeletonHeadlines = () => (
  <div className="animate-pulse">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="p-3 flex items-start gap-3 border-b border-white/5 last:border-b-0">
        <div className="w-20 h-20 rounded-xl bg-white/5 shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-2.5 w-24 bg-white/5 rounded" />
          <div className="h-3 w-11/12 bg-white/8 rounded" />
          <div className="h-3 w-4/5 bg-white/8 rounded" />
          <div className="h-2 w-3/4 bg-white/5 rounded mt-2" />
        </div>
      </div>
    ))}
  </div>
);

// =============================================================================
// TITLE NAV — two big serif titles side by side; tap to switch sections.
// The active title has an underline indicator. Replaces the bottom tab bar.
// =============================================================================
const TitleNav = ({ active, onChange }) => {
  const tabs = [
    { id: 'library', label: 'Library' },
    { id: 'news',    label: 'News' },
    { id: 'stats',   label: 'Stats' },
  ];
  return (
    <div className="flex items-end gap-4">
      {tabs.map(t => {
        const on = active === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} className="relative pb-1">
            <h1 className={`serif text-[28px] leading-none transition-colors ${on ? 'text-white' : 'text-zinc-500'}`}>
              {t.label}
            </h1>
            {on && (
              <div className="absolute -bottom-0.5 left-0 right-0 h-[2px] rounded-full" style={{ background: '#d4a574' }} />
            )}
          </button>
        );
      })}
    </div>
  );
};

// =============================================================================
// APP
// =============================================================================
const App = () => {
  const [games, setGames] = useState(loadGames);
  const [tab, setTab] = useState('library');
  const [section, setSection] = useState('top50');
  const [selectedId, setSelectedId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [gistConfig, setGistConfig] = useState(loadGistConfig);

  // In-app podcast player — state lifted here so the iframe persists
  // across tab/screen changes and the player can collapse into a mini bar.
  const [playingEpisode, setPlayingEpisode] = useState(null); // { pod, episode }
  const [playerMode, setPlayerMode] = useState('expanded');   // 'expanded' | 'mini'
  const playEpisode = (pod, episode) => {
    if (!episode) return;
    setPlayingEpisode({ pod, episode });
    setPlayerMode('expanded');
  };
  const closePlayer = () => setPlayingEpisode(null);

  // Auto-sync to Gist 5 seconds after the last games change (debounced).
  // Skips the very first effect run so we don't immediately push on mount.
  const skipFirstGistSync = useRef(true);
  useEffect(() => {
    if (skipFirstGistSync.current) { skipFirstGistSync.current = false; return; }
    if (!gistConfig) return;
    const timer = setTimeout(async () => {
      try {
        await updateGist(gistConfig.token, gistConfig.gistId, games);
        const next = { ...gistConfig, lastSyncedAt: Date.now() };
        saveGistConfig(next);
        setGistConfig(next);
      } catch (e) {
        console.warn('Gist auto-sync failed:', e.message || e);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [games, gistConfig?.token, gistConfig?.gistId]);
  const [enrichStatus, setEnrichStatus] = useState({ active: false, done: 0, total: 0 });
  const enrichStartedRef = useRef(false);

  const existingIds = useMemo(() => new Set(games.map(g => g.id)), [games]);
  const addGame = (g) => setGames(prev => rerankTop50([...prev, g]));
  const updateGame = (g) => setGames(prev => rerankTop50(prev.map(x => x.id === g.id ? g : x)));
  const applyPatchToGame = (id, patch) =>
    setGames(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x));
  // Tap-to-toggle a completion flag (story / platinum / replayed) straight
  // from the detail screen — no edit sheet needed.
  const toggleCompletion = (id, key) =>
    setGames(prev => prev.map(g => g.id === id
      ? { ...g, completion: { story: false, platinum: false, replayed: false, ...(g.completion || {}), [key]: !(g.completion?.[key]) } }
      : g));
  const deleteGame = (id) => {
    setGames(prev => rerankTop50(prev.filter(x => x.id !== id)));
    if (selectedId === id) setSelectedId(null);
  };
  const editGame = useMemo(() => games.find(g => g.id === editId), [games, editId]);

  // Swap a Rumored game with its neighbor in the array (direction: -1 up, +1 down)
  const reorderRumored = (id, direction) => {
    setGames(prev => {
      const idx = prev.findIndex(g => g.id === id);
      if (idx < 0) return prev;
      // Find next/prev game also in 'rumored' state
      let neighborIdx = idx + direction;
      while (neighborIdx >= 0 && neighborIdx < prev.length && prev[neighborIdx].state !== 'rumored') {
        neighborIdx += direction;
      }
      if (neighborIdx < 0 || neighborIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[neighborIdx]] = [next[neighborIdx], next[idx]];
      return next;
    });
  };

  // Save scroll positions before opening Detail; LibraryScreen restores on remount
  const savedScrollsRef = useRef(null);
  const openDetail = (id) => {
    const rows = {};
    document.querySelectorAll('[data-flowkey]').forEach(el => {
      rows[el.dataset.flowkey] = el.scrollLeft;
    });
    savedScrollsRef.current = { y: window.scrollY, rows };
    setSelectedId(id);
  };

  useEffect(() => { saveGames(games); }, [games]);

  // RAWG enrichment — fires once on mount, fetches metadata for games
  // that haven't been checked yet. Skip Rumored (too vague to search well).
  useEffect(() => {
    if (enrichStartedRef.current) return;
    enrichStartedRef.current = true;

    let cancelled = false;
    const snapshot = games;
    const toEnrich = snapshot.filter(g => !g.rawgChecked && g.state !== 'rumored');
    if (toEnrich.length === 0) return;

    setEnrichStatus({ active: true, done: 0, total: toEnrich.length });

    (async () => {
      let done = 0;
      // Year hint can come from g.year OR from the parsed expectedDate
      const targetYearOf = (g) => {
        if (g.year) return g.year;
        if (g.expectedDate) {
          const sk = parseExpected(g.expectedDate).sortKey;
          if (sk >= 10000) return Math.floor(sk / 10000);
        }
        return null;
      };

      for (const g of toEnrich) {
        if (cancelled) break;
        try {
          const match = await searchRawg(g.title, targetYearOf(g));
          const patch = match ? {
            coverImage: match.background_image || null,
            rawgId: match.id,
            rawgReleased: match.released || null,
            rawgPlatforms: (match.platforms || []).map(p => p.platform?.name).filter(Boolean),
            rawgPlaytime: match.playtime || null,
            rawgGenres: (match.genres || []).map(genre => genre.slug).filter(Boolean),
            rawgMetacritic: match.metacritic || null,
            rawgChecked: true,
          } : { rawgChecked: true };
          setGames(prev => prev.map(x => x.id === g.id ? { ...x, ...patch } : x));
        } catch (e) {
          console.warn('RAWG miss for', g.title, e.message);
          // Don't mark checked — let it retry next session
        }
        done++;
        setEnrichStatus({ active: true, done, total: toEnrich.length });
        await new Promise(r => setTimeout(r, 60)); // polite pacing
      }
      setEnrichStatus({ active: false, done, total: toEnrich.length });
    })();

    return () => { cancelled = true; };
  }, []);

  const selected = useMemo(() => games.find(g => g.id === selectedId), [games, selectedId]);

  // Prev/next ordering for the detail screen, following the active section.
  const navOrder = useMemo(() => buildNavOrder(games, section), [games, section]);
  const navIdx = selectedId ? navOrder.indexOf(selectedId) : -1;
  const hasPrev = navIdx > 0;
  const hasNext = navIdx >= 0 && navIdx < navOrder.length - 1;

  return (
    <div className="min-h-screen bg-ink-950 text-zinc-100 max-w-md mx-auto relative">
      {selected ? (
        <GameDetailScreen
          game={selected}
          onBack={() => setSelectedId(null)}
          onEdit={() => setEditId(selected.id)}
          onToggleCompletion={toggleCompletion}
          onPrev={() => { if (hasPrev) setSelectedId(navOrder[navIdx - 1]); }}
          onNext={() => { if (hasNext) setSelectedId(navOrder[navIdx + 1]); }}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      ) : (
        <>
          {tab === 'library' && (
            <LibraryScreen
              games={games}
              onSelect={g => openDetail(g.id)}
              section={section}
              setSection={setSection}
              enrichStatus={enrichStatus}
              onAdd={() => setAddOpen(true)}
              onOpenBackup={() => setBackupOpen(true)}
              onReorderRumored={reorderRumored}
              savedScrollsRef={savedScrollsRef}
              tab={tab}
              onTabChange={setTab}
              addGame={addGame}
              applyPatchToGame={applyPatchToGame}
            />
          )}
          {tab === 'news' && (
            <NewsScreen
              games={games}
              onSelect={g => openDetail(g.id)}
              tab={tab}
              onTabChange={setTab}
              onPlayEpisode={playEpisode}
            />
          )}
          {tab === 'stats' && (
            <StatsScreen
              games={games}
              tab={tab}
              onTabChange={setTab}
            />
          )}
        </>
      )}

      <AddGameSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={addGame}
        existingIds={existingIds}
      />
      <EditGameSheet
        open={!!editId}
        game={editGame}
        onClose={() => setEditId(null)}
        onSave={updateGame}
        onDelete={deleteGame}
      />
      <BackupSheet
        open={backupOpen}
        onClose={() => setBackupOpen(false)}
        onExport={() => exportLibrary(games)}
        onImport={() => importLibrary(setGames)}
        games={games}
        setGames={setGames}
        gistConfig={gistConfig}
        setGistConfig={setGistConfig}
      />

      {/* In-app YouTube player. Stays mounted while a podcast is loaded so
          the iframe survives mode/tab changes. */}
      <PodcastPlayer
        playing={playingEpisode}
        mode={playerMode}
        onMinimize={() => setPlayerMode('mini')}
        onExpand={() => setPlayerMode('expanded')}
        onClose={closePlayer}
      />
    </div>
  );
};

// Catches render errors so a bad data shape doesn't blank the whole tab.
// Offers a one-tap reset that wipes the news cache and reloads.
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    try { console.error('VGL error caught:', error, info); } catch {}
  }
  reset = () => {
    try {
      localStorage.removeItem('vgl.news.v1');
      localStorage.removeItem('vgl.news.v2');
    } catch {}
    location.reload();
  };
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-ink-950 text-zinc-100">
          <div className="max-w-sm text-center">
            <div className="text-4xl mb-3">🎮</div>
            <h2 className="serif text-[26px] mb-2">Something went wrong</h2>
            <p className="text-zinc-400 text-sm leading-relaxed mb-5">
              {String(this.state.error?.message || this.state.error).slice(0, 220)}
            </p>
            <button
              onClick={this.reset}
              className="px-4 py-2 rounded-full bg-white text-ink-950 text-sm font-medium"
            >
              Reset news cache &amp; reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><App /></ErrorBoundary>);

// Register service worker (foundation for future push notifications)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed:', err));
  });
}
