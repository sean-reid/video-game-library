import { useMemo, useState } from 'react';
import { TIER, effectiveCover, gradientFor } from '../../utils/gameHelpers.js';
import type { FranchiseRow } from '../../utils/stats.js';

type SortMode = 'overall' | 'count' | 'score';

interface TopFranchisesProps {
  rows: FranchiseRow[];
}

// Overall blends breadth + quality: a LOG-normalised game count against the
// biggest franchise (0..1) and avg score on the 80-100 tier scale (0..1),
// then averaged. Log (vs linear) count gives diminishing returns — the first
// games matter most — so a 4-game/97 series clears a tiny 2-game/100 one,
// while a big score gap can still let a smaller franchise win.
function overallScore(f: FranchiseRow, maxCount: number): number {
  const countNorm = Math.log(1 + f.count) / Math.log(1 + maxCount);
  const scoreNorm = f.avgScore != null ? Math.max(0, Math.min(1, (f.avgScore - 80) / 20)) : 0;
  return (countNorm + scoreNorm) / 2;
}

export function TopFranchises({ rows }: TopFranchisesProps) {
  const [sort, setSort] = useState<SortMode>('overall');

  const sorted = useMemo(() => {
    const list = [...rows];
    const maxCount = Math.max(2, ...list.map((f) => f.count));
    if (sort === 'overall') {
      list.sort(
        (a, b) => overallScore(b, maxCount) - overallScore(a, maxCount) || b.count - a.count,
      );
    } else if (sort === 'score') {
      list.sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1) || b.count - a.count);
    } else {
      list.sort((a, b) => b.count - a.count || (b.avgScore ?? 0) - (a.avgScore ?? 0));
    }
    return list.slice(0, 10);
  }, [rows, sort]);

  if (rows.length === 0) {
    return (
      <div className="text-sm text-zinc-500 text-center py-4">
        Need at least 2 games from the same franchise to surface a series here.
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1 glass-light rounded-full p-1 mb-3.5 text-[10px]">
        {(
          [
            ['overall', 'Overall'],
            ['count', 'Number of games'],
            ['score', 'Top score'],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              setSort(v);
            }}
            className={`flex-1 rounded-full px-2 py-1.5 font-medium tracking-wide transition-all whitespace-nowrap ${sort === v ? 'bg-white text-ink-950' : 'text-zinc-400'}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="space-y-2.5">
        {sorted.map((f) => {
          const cover = f.recentGame ? effectiveCover(f.recentGame) : null;
          const tier = f.avgScore != null ? TIER(f.avgScore) : null;
          return (
            <div key={f.label} className="flex items-center gap-3">
              <div
                className="w-10 h-14 rounded-md overflow-hidden shrink-0 grain"
                style={
                  cover
                    ? { background: '#0a0a0c' }
                    : { background: f.recentGame ? gradientFor(f.recentGame) : '#27272a' }
                }
              >
                {cover && (
                  <img src={cover} alt="" loading="lazy" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="serif text-[15px] text-white truncate">{f.label}</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mt-0.5">
                  {f.count} game{f.count === 1 ? '' : 's'}
                  {f.masterpieces > 0 &&
                    ` · ${String(f.masterpieces)} masterpiece${f.masterpieces === 1 ? '' : 's'}`}
                </div>
              </div>
              {f.avgScore != null && tier && (
                <div className="text-right shrink-0">
                  <div
                    className="text-[15px] font-semibold tabular-nums"
                    style={{ color: tier.color }}
                  >
                    {f.avgScore.toFixed(1)}
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-medium">
                    avg
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
