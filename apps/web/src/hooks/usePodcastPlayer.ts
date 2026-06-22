import { useCallback, useState } from 'react';
import type { PlayerMode, PlayingItem } from '../components/player/PodcastPlayer.js';
import type { PodcastBundle, PodcastEpisode } from '../types/index.js';

export interface UsePodcastPlayerResult {
  playing: PlayingItem | null;
  mode: PlayerMode;
  playEpisode: (pod: PodcastBundle, episode: PodcastEpisode) => void;
  minimize: () => void;
  expand: () => void;
  close: () => void;
}

// Owns the lifted-up podcast player state so the YouTube iframe survives
// tab/screen changes (the component stays mounted at App level regardless
// of which screen is active).
export function usePodcastPlayer(): UsePodcastPlayerResult {
  const [playing, setPlaying] = useState<PlayingItem | null>(null);
  const [mode, setMode] = useState<PlayerMode>('expanded');

  const playEpisode = useCallback((pod: PodcastBundle, episode: PodcastEpisode): void => {
    if (!episode) return;
    setPlaying({ pod, episode });
    setMode('expanded');
  }, []);

  const minimize = useCallback(() => {
    setMode('mini');
  }, []);

  const expand = useCallback(() => {
    setMode('expanded');
  }, []);

  const close = useCallback(() => {
    setPlaying(null);
  }, []);

  return { playing, mode, playEpisode, minimize, expand, close };
}
