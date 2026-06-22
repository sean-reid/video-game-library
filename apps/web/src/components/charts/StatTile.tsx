import type { ReactNode } from 'react';

interface StatTileProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}

export function StatTile({ label, value, sub }: StatTileProps) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
        {label}
      </div>
      <div className="serif text-[36px] leading-none text-white mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-1.5">{sub}</div>}
    </div>
  );
}
