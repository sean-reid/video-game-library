import { CATEGORIES } from '../../data/constants.js';
import type { Rating } from '../../types/index.js';

interface RatingBreakdownProps {
  rating: Rating;
  color: string;
}

export function RatingBreakdown({ rating, color }: RatingBreakdownProps) {
  return (
    <div className="space-y-2.5">
      {CATEGORIES.map((c) => {
        const v = rating[c.key];
        return (
          <div key={c.key} className="flex items-center gap-3">
            <div className="text-[12px] uppercase tracking-wider text-zinc-400 w-20 shrink-0 font-medium">
              {c.label}
            </div>
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${String(v * 10)}%`, background: color }}
              />
            </div>
            <div className="text-[13px] tabular-nums w-5 text-right text-zinc-300 font-medium">
              {v}
            </div>
          </div>
        );
      })}
    </div>
  );
}
