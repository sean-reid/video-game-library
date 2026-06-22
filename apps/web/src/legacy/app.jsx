import React from 'react';
import * as ReactDOM from 'react-dom/client';
import { STORAGE_KEY } from '../data/config.js';
import { STATE_META } from '../data/constants.js';
import { PLATFORM_PRIORITY, RAWG_PLATFORM_IDS } from '../data/platforms.js';
import { SEED_GAMES } from '../data/seed.js';
import { loadGistConfig } from '../services/gistApi.ts';
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
import { GameDetailScreen, buildNavOrder } from '../components/screens/GameDetailScreen.tsx';
import { LibraryScreen } from '../components/screens/LibraryScreen.tsx';
import { NewsScreen } from '../components/screens/NewsScreen.tsx';
import { StatsScreen } from '../components/screens/StatsScreen.tsx';
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
