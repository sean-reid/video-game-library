import { TIER_BAND_ORDER, type StackedTier, type TierBand } from '../../utils/stats.js';

export const TIER_BAND_COLORS: Record<TierBand, string> = {
  Masterpiece: '#e2b878',
  Amazing: '#a8b4c0',
  Great: '#b87349',
  Other: '#3f3f46',
};

export const TIER_BAND_LABEL: Record<TierBand, string> = {
  Masterpiece: 'Masterpiece',
  Amazing: 'Amazing',
  Great: 'Great',
  Other: 'Played',
};

const tierTextColor = (t: TierBand): string =>
  t === 'Other' ? 'rgba(255,255,255,0.75)' : '#0a0a0c';

export function TierLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-3">
      {TIER_BAND_ORDER.map((t) => (
        <div key={t} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: TIER_BAND_COLORS[t] }} />
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">
            {TIER_BAND_LABEL[t]}
          </span>
        </div>
      ))}
    </div>
  );
}

interface TierStackedBarProps {
  rows: StackedTier[];
  labelWidth?: string;
}

export function TierStackedBar({ rows, labelWidth = '4ch' }: TierStackedBarProps) {
  if (rows.length === 0) {
    return <div className="text-sm text-zinc-500 text-center py-2">No data yet.</div>;
  }
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2.5">
          <div
            className="text-[11px] text-zinc-300 shrink-0 font-medium tabular-nums truncate"
            style={{ width: labelWidth }}
            title={r.label}
          >
            {r.label}
          </div>
          <div className="flex-1 h-5 rounded-md overflow-hidden flex bg-white/5">
            {TIER_BAND_ORDER.map((t) => {
              const seg = r.segments[t];
              if (seg === 0) return null;
              return (
                <div
                  key={t}
                  className="flex items-center justify-center text-[10px] font-semibold tabular-nums"
                  style={{
                    width: `${String((seg / maxTotal) * 100)}%`,
                    background: TIER_BAND_COLORS[t],
                    color: tierTextColor(t),
                    minWidth: 16,
                  }}
                  title={`${TIER_BAND_LABEL[t]}: ${String(seg)}`}
                >
                  {seg}
                </div>
              );
            })}
          </div>
          <div className="text-[11px] text-zinc-500 tabular-nums w-6 shrink-0 text-right">
            {r.total}
          </div>
        </div>
      ))}
    </div>
  );
}
