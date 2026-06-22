export type NewsFilter =
  | 'all'
  | 'library'
  | 'nintendo'
  | 'playstation'
  | 'review'
  | 'upcoming'
  | 'hardware';

const NEWS_FILTERS: { id: NewsFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'library', label: 'In Library' },
  { id: 'nintendo', label: 'Nintendo' },
  { id: 'playstation', label: 'PlayStation' },
  { id: 'review', label: 'Reviews' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'hardware', label: 'Hardware' },
];

interface NewsFiltersProps {
  active: NewsFilter;
  onChange: (id: NewsFilter) => void;
}

export function NewsFilters({ active, onChange }: NewsFiltersProps) {
  return (
    <div className="px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar">
      {NEWS_FILTERS.map((f) => {
        const on = active === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              onChange(f.id);
            }}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
              on ? 'bg-white text-ink-950' : 'glass-light text-zinc-300'
            }`}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
