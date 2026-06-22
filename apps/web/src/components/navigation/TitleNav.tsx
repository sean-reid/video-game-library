export type TopTab = 'library' | 'news' | 'stats';

interface TitleNavProps {
  active: TopTab;
  onChange: (id: TopTab) => void;
}

const TABS: { id: TopTab; label: string }[] = [
  { id: 'library', label: 'Library' },
  { id: 'news', label: 'News' },
  { id: 'stats', label: 'Stats' },
];

export function TitleNav({ active, onChange }: TitleNavProps) {
  return (
    <div className="flex items-end gap-4">
      {TABS.map((t) => {
        const on = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              onChange(t.id);
            }}
            className="relative pb-1"
          >
            <h1
              className={`serif text-[28px] leading-none transition-colors ${on ? 'text-white' : 'text-zinc-500'}`}
            >
              {t.label}
            </h1>
            {on && (
              <div
                className="absolute -bottom-0.5 left-0 right-0 h-[2px] rounded-full"
                style={{ background: '#d4a574' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
