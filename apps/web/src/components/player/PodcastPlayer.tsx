import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  extractYouTubeId,
  formatPlayerTime,
  loadYouTubeApi,
  parseChapters,
  youtubeUrlAt,
} from '../../services/youtubeApi.js';
import type { PodcastBundle, PodcastEpisode } from '../../types/index.js';
import { Icon } from '../common/Icon.js';

const SKIP_SECONDS = 15;

export interface PlayingItem {
  pod: PodcastBundle;
  episode: PodcastEpisode;
}

export type PlayerMode = 'expanded' | 'mini';

interface YTPlayer {
  loadVideoById?: (id: string) => void;
  playVideo?: () => void;
  pauseVideo?: () => void;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  destroy?: () => void;
}

interface YTPlayerOptions {
  videoId: string;
  width: string | number;
  height: string | number;
  playerVars: Record<string, number>;
  events: {
    onReady: (e: YTReadyEvent) => void;
    onStateChange: (e: YTStateChangeEvent) => void;
    onError: () => void;
  };
}

interface YTConstructor {
  new (host: HTMLElement, opts: YTPlayerOptions): YTPlayer;
}

declare global {
  interface Window {
    YT?: { Player: YTConstructor };
  }
}

interface YTStateChangeEvent {
  data: number;
  target: YTPlayer & { getDuration: () => number };
}

interface YTReadyEvent {
  target: YTPlayer & { getDuration: () => number; playVideo: () => void };
}

interface SlotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface PodcastPlayerProps {
  playing: PlayingItem | null;
  mode: PlayerMode;
  onMinimize: () => void;
  onExpand: () => void;
  onClose: () => void;
}

export function PodcastPlayer({
  playing,
  mode,
  onMinimize,
  onExpand,
  onClose,
}: PodcastPlayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotRect, setSlotRect] = useState<SlotRect | null>(null);

  const videoId = playing ? extractYouTubeId(playing.episode.youtubeUrl) : null;
  const chapters = useMemo(
    () => parseChapters(playing?.episode.description),
    [playing],
  );

  const activeChapterIdx = useMemo(() => {
    if (chapters.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < chapters.length; i++) {
      const c = chapters[i];
      if (c && currentTime + 0.5 >= c.time) idx = i;
      else break;
    }
    return idx;
  }, [chapters, currentTime]);

  useEffect(() => {
    if (!playing || !videoId) return;
    let cancelled = false;
    setError(null);

    void loadYouTubeApi().then(() => {
      if (cancelled || !hostRef.current) return;
      const existing = playerRef.current;
      if (existing?.loadVideoById) {
        try {
          existing.loadVideoById(videoId);
        } catch {
          /* ignore */
        }
        return;
      }
      const YT = window.YT;
      if (!YT) return;
      playerRef.current = new YT.Player(hostRef.current, {
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
          onReady: (e: YTReadyEvent) => {
            if (cancelled) return;
            setIsReady(true);
            setDuration(e.target.getDuration() || 0);
            try {
              e.target.playVideo();
            } catch {
              /* ignore */
            }
          },
          onStateChange: (e: YTStateChangeEvent) => {
            const s = e.data;
            setIsPlaying(s === 1);
            if (s === 1 || s === 2) {
              const d = e.target.getDuration() || 0;
              if (d && Math.abs(d - duration) > 0.5) setDuration(d);
            }
          },
          onError: () => {
            setError("This video can't be embedded.");
          },
        },
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useEffect(() => {
    if (!isReady || !playerRef.current) return undefined;
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime || scrubbing) return;
      const t = p.getCurrentTime();
      if (typeof t === 'number') setCurrentTime(t);
      const d = p.getDuration?.() ?? 0;
      if (d && Math.abs(d - duration) > 0.5) setDuration(d);
    }, 500);
    return () => {
      clearInterval(id);
    };
  }, [isReady, scrubbing, duration]);

  useEffect(() => {
    if (mode !== 'expanded') {
      setSlotRect(null);
      return undefined;
    }
    let rafId: number | null = null;
    const apply = (): void => {
      rafId = null;
      if (!slotRef.current) return;
      const r = slotRef.current.getBoundingClientRect();
      setSlotRect((prev) =>
        prev &&
        Math.abs(prev.top - r.top) < 0.5 &&
        Math.abs(prev.left - r.left) < 0.5 &&
        Math.abs(prev.width - r.width) < 0.5 &&
        Math.abs(prev.height - r.height) < 0.5
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      );
    };
    const schedule = (): void => {
      if (rafId == null) rafId = requestAnimationFrame(apply);
    };
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

  const skip = (delta: number): void => {
    const p = playerRef.current;
    if (!p?.getCurrentTime || !p.seekTo) return;
    const t = (p.getCurrentTime() || 0) + delta;
    const next = Math.max(0, Math.min(t, duration || t));
    p.seekTo(next, true);
    setCurrentTime(next);
  };
  const togglePlay = (): void => {
    const p = playerRef.current;
    if (!p) return;
    if (isPlaying) p.pauseVideo?.();
    else p.playVideo?.();
  };
  const seekTo = useCallback((t: number) => {
    playerRef.current?.seekTo?.(t, true);
    playerRef.current?.playVideo?.();
    setCurrentTime(t);
  }, []);

  const currentYouTubeUrl = (secs: number): string =>
    youtubeUrlAt(playing?.episode.youtubeUrl, secs);

  const chapterRows = useMemo(
    () =>
      chapters.map((c, i) => {
        const active = i === activeChapterIdx;
        return (
          <button
            key={`${String(c.time)}-${String(i)}`}
            type="button"
            onClick={() => {
              seekTo(c.time);
            }}
            className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-colors ${active ? 'bg-white/10' : 'hover:bg-white/5 active:bg-white/10'}`}
          >
            <span
              className="text-[11px] tabular-nums font-semibold shrink-0 w-12"
              style={{ color: active ? '#e2b878' : '#71717a' }}
            >
              {formatPlayerTime(c.time)}
            </span>
            <span
              className={`text-[13px] leading-snug ${active ? 'text-white' : 'text-zinc-300'} line-clamp-2`}
            >
              {c.label}
            </span>
          </button>
        );
      }),
    [chapters, activeChapterIdx, seekTo],
  );

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
      navigator.mediaSession.setActionHandler('pause', () =>
        playerRef.current?.pauseVideo?.(),
      );
      navigator.mediaSession.setActionHandler('seekbackward', (d) => {
        skip(-(d.seekOffset ?? 10));
      });
      navigator.mediaSession.setActionHandler('seekforward', (d) => {
        skip(d.seekOffset ?? 10);
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        skip(-10);
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        skip(10);
      });
    } catch {
      /* unsupported */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {
      /* ignore */
    }
    try {
      if (duration > 0 && navigator.mediaSession.setPositionState) {
        navigator.mediaSession.setPositionState({
          duration,
          position: Math.min(currentTime, duration),
          playbackRate: 1,
        });
      }
    } catch {
      /* setPositionState can throw on bad values */
    }
  }, [isPlaying, currentTime, duration]);

  useEffect(() => {
    if (playing) return;
    if (playerRef.current) {
      try {
        playerRef.current.destroy?.();
      } catch {
        /* ignore */
      }
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
      <div
        className="fixed"
        style={
          mode === 'expanded' && slotRect
            ? {
                top: slotRect.top,
                left: 0,
                right: 0,
                marginLeft: 'auto',
                marginRight: 'auto',
                width: 'min(calc(100vw - 32px), 416px)',
                height: 'calc(min(100vw - 32px, 416px) * 0.5625)',
                zIndex: 55,
              }
            : {
                left: '-10000px',
                top: 0,
                width: 1,
                height: 1,
                overflow: 'hidden',
                zIndex: -1,
              }
        }
      >
        <div className="w-full h-full bg-black rounded-2xl overflow-hidden">
          <div ref={hostRef} className="w-full h-full" />
        </div>
      </div>

      {mode === 'expanded' && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            onClick={onMinimize}
            role="presentation"
            aria-label="Collapse player"
          />
          <div
            ref={sheetRef}
            className="fixed bottom-0 inset-x-0 z-50 max-w-md mx-auto bg-ink-950 rounded-t-3xl border-t border-white/10 flex flex-col"
            style={{ maxHeight: '92vh' }}
          >
            <button
              type="button"
              onClick={onMinimize}
              className="flex justify-center pt-2.5 pb-1 shrink-0 w-full"
              aria-label="Collapse player"
            >
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </button>

            <div className="flex items-center justify-between px-3 pb-2 shrink-0">
              <button
                type="button"
                onClick={onMinimize}
                className="glass-light rounded-full p-2"
                aria-label="Minimize"
              >
                <Icon name="arrowDown" className="w-5 h-5 text-zinc-300" />
              </button>
              <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                Now playing
              </div>
              <button
                type="button"
                onClick={onClose}
                className="glass-light rounded-full p-2"
                aria-label="Close player"
              >
                <Icon name="close" className="w-5 h-5 text-zinc-300" />
              </button>
            </div>

            <div
              ref={slotRef}
              className="mx-4 rounded-2xl bg-black shrink-0"
              style={{ aspectRatio: '16 / 9' }}
            />

            <div className="px-5 mt-3 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div
                  className="text-[11px] uppercase tracking-[0.18em] font-medium"
                  style={{ color: playing.pod.accent || '#d4a574' }}
                >
                  {playing.pod.show}
                </div>
                <a
                  href={currentYouTubeUrl(currentTime)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.stopPropagation();
                    const live = playerRef.current?.getCurrentTime?.();
                    e.currentTarget.href = currentYouTubeUrl(
                      typeof live === 'number' ? live : currentTime,
                    );
                  }}
                  className="flex items-center gap-1 shrink-0 glass-light rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider text-zinc-300 font-medium"
                >
                  YouTube ↗
                </a>
              </div>
              <h2 className="serif text-[19px] leading-tight text-white mt-1 line-clamp-2">
                {playing.episode.title}
              </h2>
              {error && <div className="text-[12px] text-rose-300/80 mt-2">{error}</div>}
            </div>

            <div className="px-5 mt-3 shrink-0">
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.5}
                value={currentTime}
                onChange={(e) => {
                  setScrubbing(true);
                  setCurrentTime(parseFloat(e.target.value));
                }}
                onMouseUp={(e) => {
                  seekTo(parseFloat((e.target as HTMLInputElement).value));
                  setScrubbing(false);
                }}
                onTouchEnd={(e) => {
                  seekTo(parseFloat((e.target as HTMLInputElement).value));
                  setScrubbing(false);
                }}
                className="w-full"
                style={{ accentColor: '#e2b878' }}
                aria-label="Scrubber"
              />
              <div className="flex justify-between text-[11px] text-zinc-500 tabular-nums mt-1">
                <span>{formatPlayerTime(currentTime)}</span>
                <span>{formatPlayerTime(duration)}</span>
              </div>
            </div>

            <div className="mt-3 mb-1 flex items-center justify-center gap-10 shrink-0">
              <button
                type="button"
                onClick={() => {
                  skip(-SKIP_SECONDS);
                }}
                className="text-zinc-200 active:scale-95 transition-transform"
                aria-label="Back 15 seconds"
              >
                <Icon name="skipBack15" className="w-9 h-9" />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                className="bg-white text-ink-950 rounded-full w-14 h-14 flex items-center justify-center active:scale-95 transition-transform"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} className="w-6 h-6" filled />
              </button>
              <button
                type="button"
                onClick={() => {
                  skip(SKIP_SECONDS);
                }}
                className="text-zinc-200 active:scale-95 transition-transform"
                aria-label="Forward 15 seconds"
              >
                <Icon name="skipForward15" className="w-9 h-9" />
              </button>
            </div>

            {chapters.length > 0 && (
              <div className="mt-2 flex flex-col min-h-0 flex-1">
                <div className="px-5 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium shrink-0 mb-1.5">
                  Chapters
                </div>
                <div className="overflow-y-auto overscroll-contain px-3 pb-4">{chapterRows}</div>
              </div>
            )}

            {chapters.length === 0 && <div className="pb-6 shrink-0" />}
          </div>
        </>
      )}

      {mode === 'mini' && (
        <div className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
          <div className="max-w-md mx-auto pb-safe">
            <div
              className="mx-3 mb-3 glass rounded-2xl flex items-center gap-3 p-2 pointer-events-auto cursor-pointer"
              onClick={onExpand}
              role="button"
              tabIndex={0}
              aria-label="Expand player"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onExpand();
              }}
            >
              <div
                className="w-11 h-11 rounded-xl overflow-hidden shrink-0 grain flex items-center justify-center text-xl"
                style={{ background: playing.pod.coverGradient }}
              >
                🎙️
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-white truncate leading-tight">
                  {playing.episode.title}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium truncate mt-0.5">
                  {playing.pod.show} · {formatPlayerTime(currentTime)} /{' '}
                  {formatPlayerTime(duration)}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="bg-white text-ink-950 rounded-full w-9 h-9 flex items-center justify-center shrink-0"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} className="w-4 h-4" filled />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
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
}
