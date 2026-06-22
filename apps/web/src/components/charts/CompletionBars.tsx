import { Icon, type IconName } from '../common/Icon.js';

interface CompletionBarsProps {
  completion: { story: number; platinum: number; replayed: number };
  totalRated: number;
}

const ROWS: { key: keyof CompletionBarsProps['completion']; label: string; icon: IconName }[] = [
  { key: 'story', label: 'Story finished', icon: 'check' },
  { key: 'platinum', label: 'Platinum / 100%', icon: 'trophy' },
  { key: 'replayed', label: 'Replayed', icon: 'replay' },
];

export function CompletionBars({ completion, totalRated }: CompletionBarsProps) {
  if (totalRated === 0) {
    return <div className="text-sm text-zinc-500 text-center py-2">No rated games yet.</div>;
  }
  return (
    <div className="space-y-3">
      {ROWS.map(({ key, label, icon }) => {
        const count = completion[key];
        const pct = (count / totalRated) * 100;
        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Icon name={icon} className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-[12px] uppercase tracking-wider text-zinc-300 font-medium">
                  {label}
                </span>
              </div>
              <div className="text-[12px] text-zinc-300 tabular-nums">
                <span style={{ color: '#e2b878' }}>{count}</span>
                <span className="text-zinc-500">
                  {' / '}
                  {totalRated} · {pct.toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${String(pct)}%`, background: '#e2b878' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
