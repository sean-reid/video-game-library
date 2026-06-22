import { formatPlayerTime } from '../../services/youtubeApi.js';
import type { PlayingItem } from '../../types/index.js';
import { Icon } from '../common/Icon.js';

interface PodcastMiniBarProps {
  playing: PlayingItem;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onExpand: () => void;
  onTogglePlay: () => void;
  onClose: () => void;
}

// Pinned-bottom mini bar shown when the player has collapsed. The
// background iframe keeps playing off-screen while this stays mounted;
// clicking anywhere on the bar (except the play / close buttons) expands
// the full sheet again. Owns no state - it's a pure render of the
// `useYouTubeIframe` hook's output.
export function PodcastMiniBar({
  playing,
  isPlaying,
  currentTime,
  duration,
  onExpand,
  onTogglePlay,
  onClose,
}: PodcastMiniBarProps) {
  return (
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
              {playing.pod.show} · {formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePlay();
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
  );
}
