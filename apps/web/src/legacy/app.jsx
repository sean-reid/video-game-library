import React from 'react';
import * as ReactDOM from 'react-dom/client';
import {
  DISMISSED_KEY,
  NEWS_STALE_MS,
  READ_KEY,
  STORAGE_KEY,
} from '../data/config.js';
import { CATEGORIES, STATE_META, TIER_COLOR_FOR_LABEL } from '../data/constants.js';
import { PLATFORM_PRIORITY, RAWG_PLATFORM_IDS } from '../data/platforms.js';
import { SEED_GAMES } from '../data/seed.js';
import { loadGistConfig } from '../services/gistApi.ts';
import {
  fetchArticle,
  fetchNews,
  loadCachedNews,
  saveCachedNews,
} from '../services/newsApi.ts';
import { searchRawg, searchRawgList, yearOf } from '../services/rawgApi.ts';
import {
  extractYouTubeId,
  formatPlayerTime,
  loadYouTubeApi,
  parseChapters,
} from '../services/youtubeApi.ts';
import { GameCard } from '../components/cards/GameCard.tsx';
import { AddGameSheet } from '../components/sheets/AddGameSheet.tsx';
import { BackupSheet } from '../components/sheets/BackupSheet.tsx';
import { PlayedView } from '../components/views/PlayedView.tsx';
import { PlayingView } from '../components/views/PlayingView.tsx';
import { RecommendedView } from '../components/views/RecommendedView.tsx';
import { RumoredView } from '../components/views/RumoredView.tsx';
import { Top50View } from '../components/views/Top50View.tsx';
import { UpcomingView } from '../components/views/UpcomingView.tsx';
import { EditGameSheet } from '../components/sheets/EditGameSheet.tsx';
import { PodcastListSheet } from '../components/sheets/PodcastListSheet.tsx';
import { ReaderSheet, articleKey } from '../components/sheets/ReaderSheet.tsx';
import { RecActionSheet } from '../components/sheets/RecActionSheet.tsx';
import { Sheet } from '../components/sheets/Sheet.tsx';
import { GameForm } from '../components/forms/GameForm.tsx';
import { RawgSearch } from '../components/forms/RawgSearch.tsx';
import {
  blankForm,
  formFromGame,
  formFromRawg,
  formToGame,
} from '../components/forms/gameFormState.ts';
import { FormSection } from '../components/forms/inputs/FormSection.tsx';
import { RatingSliderRow } from '../components/forms/inputs/RatingSliderRow.tsx';
import { StateSelector } from '../components/forms/inputs/StateSelector.tsx';
import { TextArea } from '../components/forms/inputs/TextArea.tsx';
import { TextInput } from '../components/forms/inputs/TextInput.tsx';
import { Toggle } from '../components/forms/inputs/Toggle.tsx';
import { HeadlineCard, SOURCE_COLORS } from '../components/cards/HeadlineCard.tsx';
import { PodcastCard } from '../components/cards/PodcastCard.tsx';
import { CompletionBars } from '../components/charts/CompletionBars.tsx';
import { PredictivenessRadar } from '../components/charts/PredictivenessRadar.tsx';
import { RatingBreakdown } from '../components/charts/RatingBreakdown.tsx';
import { SectionCard } from '../components/charts/SectionCard.tsx';
import { SpiderChart } from '../components/charts/SpiderChart.tsx';
import { StatTile } from '../components/charts/StatTile.tsx';
import { TIER_BAND_COLORS, TIER_BAND_LABEL, TierLegend, TierStackedBar } from '../components/charts/TierStackedBar.tsx';
import { TopFranchises } from '../components/charts/TopFranchises.tsx';
import { EmptyState } from '../components/common/EmptyState.tsx';
import { ErrorBoundary } from '../components/common/ErrorBoundary.tsx';
import { Icon } from '../components/common/Icon.tsx';
import { CoverFlowRow } from '../components/navigation/CoverFlowRow.tsx';
import { ListView } from '../components/navigation/ListView.tsx';
import { SectionNav } from '../components/navigation/SectionNav.tsx';
import { TitleNav } from '../components/navigation/TitleNav.tsx';
import {
  freshnessLabel,
  freshnessPulse,
  parseExpected,
  parseLocalDate,
  shortDate,
  shortDateLabel,
  timeAgo,
  upcomingSortKey,
} from '../utils/dateUtils.ts';
import {
  TIER,
  effectiveCover,
  gradientFor,
  hash,
  pickBestPlatform,
  primaryPlatform,
  primaryYear,
  shortPlatform,
} from '../utils/gameHelpers.ts';
import {
  TIER_BAND_ORDER,
  computeStats,
  franchiseOf,
  tierOfGame,
} from '../utils/stats.ts';

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// =============================================================================
// HELPERS
// =============================================================================



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
      const normalized = await fetchNews(forceFresh);
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
// IN-APP YOUTUBE PLAYER
// Renders ONE stable YouTube iframe at the App level, kept alive across mode
// changes by positioning a single fixed iframe over a measured "slot" in the
// expanded sheet (or off-screen in mini). Expanded mode is a bottom sheet with
// a tappable scrim (tap → collapse to mini), custom transport (±15s, scrubber,
// play/pause), and a scrollable chapter list parsed from the video description.
// Media Session handlers are best-effort; note that iOS Safari/PWA does NOT
// keep a YouTube iframe playing once the screen locks — that's a platform wall.
// =============================================================================

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

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><App /></ErrorBoundary>);

// Register service worker (foundation for future push notifications)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed:', err));
  });
}
