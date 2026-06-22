import type { EventItem } from '../../types/index.js';
import { Icon } from '../common/Icon.js';

interface EventBannerProps {
  event: EventItem;
  onDismiss: (id: string) => void;
}

// Renders a Nintendo Direct / PlayStation State of Play banner from the
// worker's `/news` events payload, gradient-coded by platform. Dismissable
// like RecentReleaseBanner; the caller persists the dismissed id set.
export function EventBanner({ event, onDismiss }: EventBannerProps) {
  const palette =
    event.type === 'nintendo'
      ? { from: '#7f1d1d', to: '#1c1917', label: 'NINTENDO' }
      : { from: '#1e3a8a', to: '#0f172a', label: 'PLAYSTATION' };
  return (
    <div
      className="mx-4 mt-3 rounded-2xl overflow-hidden grain relative"
      style={{ background: `linear-gradient(135deg, ${palette.from} 0%, ${palette.to} 100%)` }}
    >
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.22em] font-medium"
            style={{ color: event.accent }}
          >
            {palette.label}
          </div>
          <div className="serif text-[20px] text-white leading-tight mt-0.5">{event.title}</div>
          <div className="text-[12px] text-zinc-300 mt-1 tabular-nums">
            {event.date} · {event.time}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onDismiss(event.id);
          }}
          className="glass-light rounded-full p-2 shrink-0"
          aria-label="Dismiss"
        >
          <Icon name="close" className="w-4 h-4 text-zinc-300" />
        </button>
      </div>
    </div>
  );
}
