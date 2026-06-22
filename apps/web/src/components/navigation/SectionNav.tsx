import { useEffect, useRef } from 'react';

export type SectionId = 'top50' | 'playing' | 'upcoming' | 'rumored' | 'recommended' | 'played';

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'top50', label: 'Top 50' },
  { id: 'playing', label: 'Playing' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'rumored', label: 'Rumored' },
  { id: 'recommended', label: 'Recommended' },
  { id: 'played', label: 'Played' },
];

interface SectionNavProps {
  active: SectionId;
  onChange: (id: SectionId) => void;
  counts: Record<SectionId, number>;
}

export function SectionNav({ active, onChange, counts }: SectionNavProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Scroll active pill into view.
  useEffect(() => {
    const c = containerRef.current;
    const el = activeRef.current;
    if (!c || !el) return;
    const elLeft = el.offsetLeft;
    const elRight = elLeft + el.offsetWidth;
    const scrollLeft = c.scrollLeft;
    const cWidth = c.clientWidth;
    if (elLeft < scrollLeft + 8) c.scrollTo({ left: elLeft - 16, behavior: 'smooth' });
    else if (elRight > scrollLeft + cWidth - 8)
      c.scrollTo({ left: elRight - cWidth + 16, behavior: 'smooth' });
  }, [active]);

  return (
    <div className="px-4 pt-2 pb-3">
      <div
        ref={containerRef}
        className="glass-light rounded-2xl p-1 flex gap-1 overflow-x-auto no-scrollbar"
      >
        {SECTIONS.map((s) => {
          const on = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              ref={on ? activeRef : null}
              onClick={() => {
                onChange(s.id);
              }}
              className={`shrink-0 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all flex items-center gap-1.5 ${
                on ? 'bg-white text-ink-950' : 'text-zinc-300'
              }`}
            >
              {s.label}
              <span
                className={`tabular-nums text-[11px] ${on ? 'text-zinc-500' : 'text-zinc-500'}`}
              >
                {counts[s.id]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
