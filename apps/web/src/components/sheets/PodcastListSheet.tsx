import type { PodcastBundle, PodcastEpisode } from '../../types/index.js';
import { freshnessLabel, freshnessPulse, shortDate } from '../../utils/dateUtils.js';
import { Icon } from '../common/Icon.js';
import { Sheet } from './Sheet.js';

interface PodcastListSheetProps {
  open: boolean;
  pod: PodcastBundle | null;
  onClose: () => void;
  onPlay: (pod: PodcastBundle, episode: PodcastEpisode) => void;
}

export function PodcastListSheet({ open, pod, onClose, onPlay }: PodcastListSheetProps) {
  if (!open || !pod) return null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={pod.show}
      leftAction={
        <button type="button" onClick={onClose} className="text-zinc-400 text-[14px]">
          Close
        </button>
      }
    >
      <div className="px-4 pt-4 pb-8">
        <div
          className="rounded-2xl overflow-hidden grain h-24 flex items-end p-4 mb-4"
          style={{ background: pod.coverGradient }}
        >
          <div className="text-3xl drop-shadow-lg">🎙️</div>
        </div>

        <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium mb-3">
          Recent episodes
        </div>

        <div className="space-y-2.5">
          {pod.episodes.map((ep) => {
            const pulse = freshnessPulse(ep.date);
            const fresh = freshnessLabel(ep.date);
            return (
              <div key={ep.date} className="glass rounded-2xl p-3.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: pulse }}
                  />
                  <div
                    className="text-[10px] uppercase tracking-[0.18em] font-medium"
                    style={{ color: pulse }}
                  >
                    {fresh}
                  </div>
                  <span className="text-[10px] text-zinc-500 ml-auto tabular-nums">
                    {shortDate(ep.date)} · {ep.duration}
                  </span>
                </div>
                <div className="serif text-[15px] text-white leading-snug">{ep.title}</div>
                <div className="flex items-center gap-2 mt-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      onPlay(pod, ep);
                    }}
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
}
