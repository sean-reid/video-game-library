import type { PodcastBundle, PodcastEpisode } from '../../types/index.js';
import { freshnessLabel, freshnessPulse } from '../../utils/dateUtils.js';
import { Icon } from '../common/Icon.js';

interface PodcastCardProps {
  pod: PodcastBundle;
  onPlay: (pod: PodcastBundle, episode: PodcastEpisode) => void;
  onViewAll: (pod: PodcastBundle) => void;
}

export function PodcastCard({ pod, onPlay, onViewAll }: PodcastCardProps) {
  // Graceful fallback if the worker temporarily returns no episodes.
  if (pod.episodes.length === 0) {
    return (
      <div className="mx-4 mt-3 glass rounded-2xl p-4 text-sm text-zinc-500">
        No recent episodes for <span className="text-zinc-300">{pod.show}</span> yet.
      </div>
    );
  }
  const [latest, ...previous] = pod.episodes;
  if (!latest) return null;
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
            <span
              className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: pulseColor }}
            />
            <div
              className="text-[10px] uppercase tracking-[0.18em] font-medium"
              style={{ color: pulseColor }}
            >
              {freshLabel}
            </div>
          </div>
          <div className="serif text-[16px] text-white leading-tight mt-1 line-clamp-2">
            {latest.title}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium mt-1.5">
            {pod.show}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPlay(pod, latest);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-ink-950 text-[11px] font-semibold"
            >
              <Icon name="play" className="w-3 h-3" filled />
              Play
            </button>
            {latest.duration && (
              <span className="text-[11px] text-zinc-500 tabular-nums ml-auto">
                {latest.duration}
              </span>
            )}
          </div>
        </div>
      </div>
      {previous.length > 0 && (
        <button
          type="button"
          onClick={() => {
            onViewAll(pod);
          }}
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
}
