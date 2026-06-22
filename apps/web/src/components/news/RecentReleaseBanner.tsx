import { useMemo } from 'react';
import type { Game } from '../../types/index.js';
import { parseExpected } from '../../utils/dateUtils.js';
import { primaryPlatform } from '../../utils/gameHelpers.js';
import { Icon } from '../common/Icon.js';

interface RecentReleaseBannerProps {
  games: Game[];
  onSelect: (game: Game) => void;
  dismissed: Set<string>;
  onDismiss: (id: string) => void;
}

// Shows any upcoming-state library game whose `expectedDate` falls within
// the last 14 days, so the user notices it just shipped. Each banner is
// dismissable, with the dismissal key (`release-<id>`) persisted by the
// caller so it stays gone across reloads.
export function RecentReleaseBanner({
  games,
  onSelect,
  dismissed,
  onDismiss,
}: RecentReleaseBannerProps) {
  const recent = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 14 * 86_400_000);
    return games.filter((g) => {
      if (g.state !== 'upcoming') return false;
      const ed = g.expectedDate;
      if (!ed) return false;
      if (ed === 'Available') return true;
      const md = /^(\d{1,2})\/(\d{1,2})$/.exec(ed);
      if (md?.[1] && md[2]) {
        const date = new Date(now.getFullYear(), parseInt(md[1], 10) - 1, parseInt(md[2], 10));
        return date <= now && date >= cutoff;
      }
      return false;
    });
  }, [games]);

  const visible = recent.filter((g) => !dismissed.has(`release-${g.id}`));
  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((g) => {
        const exp = parseExpected(g.expectedDate);
        const plat = primaryPlatform(g);
        return (
          <div
            key={g.id}
            className="mx-4 mt-3 rounded-2xl overflow-hidden grain relative"
            style={{ background: 'linear-gradient(135deg, #78350f 0%, #1c1917 100%)' }}
          >
            <div className="p-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  onSelect(g);
                }}
                className="min-w-0 flex-1 text-left"
              >
                <div
                  className="text-[10px] uppercase tracking-[0.22em] font-medium"
                  style={{ color: '#e2b878' }}
                >
                  Recently Released
                </div>
                <div className="serif text-[20px] text-white leading-tight mt-0.5 truncate">
                  {g.title}
                </div>
                <div className="text-[12px] text-zinc-300 mt-1 tabular-nums truncate">
                  {exp.label}
                  {plat ? ` · ${plat}` : ''}
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  onDismiss(`release-${g.id}`);
                }}
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
}
