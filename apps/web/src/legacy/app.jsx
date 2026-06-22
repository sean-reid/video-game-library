import React from 'react';
import * as ReactDOM from 'react-dom/client';
import { STORAGE_KEY } from '../data/config.js';
import { STATE_META } from '../data/constants.js';
import { PLATFORM_PRIORITY, RAWG_PLATFORM_IDS } from '../data/platforms.js';
import { SEED_GAMES } from '../data/seed.js';
import { loadGistConfig } from '../services/gistApi.ts';
import { searchRawg, searchRawgList, yearOf } from '../services/rawgApi.ts';
import { GameCard } from '../components/cards/GameCard.tsx';
import { AddGameSheet } from '../components/sheets/AddGameSheet.tsx';
import { BackupSheet } from '../components/sheets/BackupSheet.tsx';
import { GameDetailScreen, buildNavOrder } from '../components/screens/GameDetailScreen.tsx';
import { LibraryScreen } from '../components/screens/LibraryScreen.tsx';
import { NewsScreen } from '../components/screens/NewsScreen.tsx';
import { StatsScreen } from '../components/screens/StatsScreen.tsx';
import { PodcastPlayer } from '../components/player/PodcastPlayer.tsx';
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
