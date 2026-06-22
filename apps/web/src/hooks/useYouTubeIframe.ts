import { useCallback, useEffect, useRef, useState } from 'react';
import { extractYouTubeId, loadYouTubeApi } from '../services/youtubeApi.js';
import type { PlayingItem } from '../types/index.js';
import { reportError } from '../utils/reportError.js';

// Wraps everything the YT IFrame API touches: the host div the iframe
// mounts into, the player ref, the lifecycle effects (load / poll /
// destroy), and the media-session wiring for iOS lockscreen controls.
// PodcastPlayer ends up as a pure render layer that just attaches the
// returned `hostRef`, reads `currentTime` / `duration` / `isPlaying`,
// and calls `togglePlay` / `skip` / `seekTo`.

interface YTPlayer {
  loadVideoById?: (id: string) => void;
  playVideo?: () => void;
  pauseVideo?: () => void;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  destroy?: () => void;
}

interface YTReadyEvent {
  target: YTPlayer & { getDuration: () => number; playVideo: () => void };
}

interface YTStateChangeEvent {
  data: number;
  target: YTPlayer & { getDuration: () => number };
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

type YTConstructor = new (host: HTMLElement, opts: YTPlayerOptions) => YTPlayer;

declare global {
  interface Window {
    YT?: { Player: YTConstructor };
  }
}

export interface UseYouTubeIframeResult {
  hostRef: React.MutableRefObject<HTMLDivElement | null>;
  isReady: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  scrubbing: boolean;
  setScrubbing: (v: boolean) => void;
  setCurrentTime: (t: number) => void;
  error: string | null;
  togglePlay: () => void;
  skip: (delta: number) => void;
  seekTo: (t: number) => void;
  getLiveTime: () => number;
}

const POLL_INTERVAL_MS = 500;

export function useYouTubeIframe(playing: PlayingItem | null): UseYouTubeIframeResult {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoId = playing ? extractYouTubeId(playing.episode.youtubeUrl) : null;

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
        } catch (e) {
          reportError('youtubeIframe.loadVideoById', e);
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
            // Lock down the iframe YouTube just mounted. sandbox blocks
            // top-frame navigation and popups; allow restricts powerful
            // feature-policy grants to the bare minimum the player needs.
            // Keep this in sync with tests/e2e/podcast-playback.spec.ts.
            const iframe = hostRef.current?.querySelector('iframe');
            if (iframe) {
              iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
              iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
              iframe.setAttribute('referrerpolicy', 'origin');
            }
            setIsReady(true);
            setDuration(e.target.getDuration() || 0);
            try {
              e.target.playVideo();
            } catch (err) {
              reportError('youtubeIframe.playVideo', err);
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
  }, [videoId]);

  // Poll the player for `currentTime` while ready and not actively scrubbing.
  useEffect(() => {
    if (!isReady || !playerRef.current) return undefined;
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime || scrubbing) return;
      const t = p.getCurrentTime();
      if (typeof t === 'number') setCurrentTime(t);
      const d = p.getDuration?.() ?? 0;
      if (d && Math.abs(d - duration) > 0.5) setDuration(d);
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
    };
  }, [isReady, scrubbing, duration]);

  // Tear down the player when nothing's loaded.
  useEffect(() => {
    if (playing) return;
    if (playerRef.current) {
      try {
        playerRef.current.destroy?.();
      } catch (e) {
        reportError('youtubeIframe.destroy', e);
      }
      playerRef.current = null;
      setIsReady(false);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [playing]);

  const skip = useCallback((delta: number): void => {
    const p = playerRef.current;
    if (!p?.getCurrentTime || !p.seekTo) return;
    const t = (p.getCurrentTime() || 0) + delta;
    const next = Math.max(0, Math.min(t, p.getDuration?.() ?? t));
    p.seekTo(next, true);
    setCurrentTime(next);
  }, []);
  const togglePlay = useCallback((): void => {
    const p = playerRef.current;
    if (!p) return;
    if (isPlaying) p.pauseVideo?.();
    else p.playVideo?.();
  }, [isPlaying]);
  const seekTo = useCallback((t: number): void => {
    playerRef.current?.seekTo?.(t, true);
    playerRef.current?.playVideo?.();
    setCurrentTime(t);
  }, []);
  const getLiveTime = useCallback(
    (): number => playerRef.current?.getCurrentTime?.() ?? currentTime,
    [currentTime],
  );

  // Media Session API - best effort. iOS uses 10s seek offsets on the
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
    } catch (e) {
      reportError('mediaSession.setup', e);
    }
  }, [playing, skip]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch (e) {
      reportError('mediaSession.playbackState', e);
    }
    try {
      if (duration > 0 && navigator.mediaSession.setPositionState) {
        navigator.mediaSession.setPositionState({
          duration,
          position: Math.min(currentTime, duration),
          playbackRate: 1,
        });
      }
    } catch (e) {
      reportError('mediaSession.setPositionState', e);
    }
  }, [isPlaying, currentTime, duration]);

  return {
    hostRef,
    isReady,
    isPlaying,
    currentTime,
    duration,
    scrubbing,
    setScrubbing,
    setCurrentTime,
    error,
    togglePlay,
    skip,
    seekTo,
    getLiveTime,
  };
}
