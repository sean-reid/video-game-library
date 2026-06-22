import { useMemo, useState } from 'react';
import { TIER_COLOR_FOR_LABEL } from '../../data/constants.js';
import { PLATFORM_PRIORITY } from '../../data/platforms.js';
import type { Game } from '../../types/index.js';
import { TIER, primaryPlatform, shortPlatform } from '../../utils/gameHelpers.js';
import { EmptyState } from '../common/EmptyState.js';
import { Icon } from '../common/Icon.js';

type SortKey = 'yearDesc' | 'yearAsc' | 'console' | 'rating';
type FilterKey = 'all' | 'top50' | 'masterpiece' | 'outsideTop50' | `console:${string}` | `year:${string}`;

interface SelectOption {
  value: string;
  label: string;
}

interface SelectGroup {
  label: string;
  options: SelectOption[];
}

interface SortFilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  groups?: SelectGroup[];
}

function SortFilterSelect({ label, value, onChange, options, groups }: SortFilterSelectProps) {
  const flat = [...options, ...(groups ?? []).flatMap((g) => g.options)];
  const displayLabel = flat.find((o) => o.value === value)?.label ?? '—';
  return (
    <div className="relative glass-light rounded-full px-3 py-1.5 flex items-center gap-1.5 text-[12px]">
      <span className="text-zinc-500 uppercase tracking-wider font-medium">{label}</span>
      <span className="text-zinc-100 font-medium">{displayLabel}</span>
      <Icon name="chevron" className="w-3 h-3 text-zinc-400" />
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {(groups ?? []).map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

const RATING_BUCKET_ORDER = ['Masterpiece', 'Amazing', 'Great', 'Good', 'Mixed', 'Unrated'];

interface PlayedViewProps {
  games: Game[];
  onSelect: (game: Game) => void;
}

export function PlayedView({ games, onSelect }: PlayedViewProps) {
  const [sort, setSort] = useState<SortKey>('yearDesc');
  const [filter, setFilter] = useState<FilterKey>('all');

  const { consoles, years } = useMemo(() => {
    const cs = new Set<string>();
    const ys = new Set<number>();
    for (const g of games) {
      if (g.state !== 'played') continue;
      const p = primaryPlatform(g);
      if (p) cs.add(p);
      if (g.year) ys.add(g.year);
    }
    const platformOrderIdx = (short: string): number => {
      const i = PLATFORM_PRIORITY.findIndex((p) => shortPlatform(p) === short);
      return i === -1 ? 999 : i;
    };
    return {
      consoles: [...cs].sort((a, b) => platformOrderIdx(a) - platformOrderIdx(b)),
      years: [...ys].sort((a, b) => b - a),
    };
  }, [games]);

  const filtered = useMemo(() => {
    const list = games.filter((g) => g.state === 'played');
    if (filter === 'all') return list;
    if (filter === 'top50') return list.filter((g) => g.topListRank != null);
    if (filter === 'masterpiece') return list.filter((g) => (g.rating?.total ?? 0) >= 100);
    if (filter === 'outsideTop50') return list.filter((g) => g.topListRank == null);
    if (filter.startsWith('console:')) {
      const p = filter.slice(8);
      return list.filter((g) => primaryPlatform(g) === p);
    }
    if (filter.startsWith('year:')) {
      const y = parseInt(filter.slice(5), 10);
      return list.filter((g) => g.year === y);
    }
    return list;
  }, [games, filter]);

  const groups = useMemo(() => {
    const list = [...filtered];
    const consoleIdx = (g: Game): number => {
      const p = primaryPlatform(g);
      const i = PLATFORM_PRIORITY.findIndex((x) => shortPlatform(x) === p);
      return i === -1 ? 999 : i;
    };

    if (sort === 'yearDesc') {
      list.sort(
        (a, b) =>
          ((b.year ?? 0) - (a.year ?? 0)) || ((a.topListRank ?? 999) - (b.topListRank ?? 999)),
      );
    } else if (sort === 'yearAsc') {
      list.sort(
        (a, b) =>
          ((a.year ?? 0) - (b.year ?? 0)) || ((a.topListRank ?? 999) - (b.topListRank ?? 999)),
      );
    } else if (sort === 'console') {
      list.sort((a, b) => consoleIdx(a) - consoleIdx(b) || (b.year ?? 0) - (a.year ?? 0));
    } else {
      list.sort((a, b) => (b.rating?.total ?? -1) - (a.rating?.total ?? -1));
    }

    let keyFn: (g: Game) => string;
    let sortKeys: (a: string, b: string) => number;
    if (sort === 'yearDesc' || sort === 'yearAsc') {
      keyFn = (g) => (g.year ? String(g.year) : 'Year unknown');
      sortKeys =
        sort === 'yearDesc'
          ? (a, b) => (parseInt(b, 10) || 0) - (parseInt(a, 10) || 0)
          : (a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0);
    } else if (sort === 'console') {
      keyFn = (g) => primaryPlatform(g) || 'Unknown';
      sortKeys = (a, b) => {
        const ai = PLATFORM_PRIORITY.findIndex((p) => shortPlatform(p) === a);
        const bi = PLATFORM_PRIORITY.findIndex((p) => shortPlatform(p) === b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      };
    } else {
      keyFn = (g) => (g.rating ? TIER(g.rating.total).label : 'Unrated');
      sortKeys = (a, b) => RATING_BUCKET_ORDER.indexOf(a) - RATING_BUCKET_ORDER.indexOf(b);
    }

    const buckets: Record<string, Game[]> = {};
    for (const g of list) {
      const k = keyFn(g);
      (buckets[k] ??= []).push(g);
    }
    return Object.keys(buckets)
      .sort(sortKeys)
      .map((k) => ({ key: k, games: buckets[k] ?? [] }));
  }, [filtered, sort]);

  const groupColor = (key: string): string =>
    TIER_COLOR_FOR_LABEL[key as keyof typeof TIER_COLOR_FOR_LABEL] ?? '#d4a574';

  return (
    <div className="screen-enter">
      <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
        <SortFilterSelect
          label="Sort"
          value={sort}
          onChange={(v) => {
            setSort(v as SortKey);
          }}
          options={[
            { value: 'yearDesc', label: 'Year (recent → oldest)' },
            { value: 'yearAsc', label: 'Year (oldest → recent)' },
            { value: 'console', label: 'Console (newest → oldest)' },
            { value: 'rating', label: 'Rating (Masterpiece → Good)' },
          ]}
        />
        <SortFilterSelect
          label="Filter"
          value={filter}
          onChange={(v) => {
            setFilter(v as FilterKey);
          }}
          options={[{ value: 'all', label: 'All' }]}
          groups={[
            {
              label: 'Rating',
              options: [
                { value: 'top50', label: 'Top 50' },
                { value: 'masterpiece', label: 'Masterpiece' },
                { value: 'outsideTop50', label: 'Outside Top 50' },
              ],
            },
            {
              label: 'Console',
              options: consoles.map((c) => ({ value: `console:${c}`, label: c })),
            },
            {
              label: 'Year',
              options: years.map((y) => ({ value: `year:${String(y)}`, label: String(y) })),
            },
          ]}
        />
      </div>

      <div className="px-4 space-y-6 pb-32">
        {groups.map((group) => (
          <div key={group.key}>
            <div
              className="serif text-[22px] mb-2 px-1"
              style={{ color: groupColor(group.key) }}
            >
              {group.key}
            </div>
            <div className="glass rounded-3xl overflow-hidden divide-y divide-white/5">
              {group.games.map((game) => {
                const tier = game.rating ? TIER(game.rating.total) : null;
                const isTop50 = game.topListRank != null;
                const plat = primaryPlatform(game);
                return (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => {
                      onSelect(game);
                    }}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <div className="w-4 shrink-0 flex justify-center">
                      {isTop50 &&
                        (tier ? (
                          <Icon
                            name="star"
                            filled
                            className="w-3.5 h-3.5"
                            style={{ color: tier.color }}
                          />
                        ) : (
                          <Icon name="star" filled className="w-3.5 h-3.5" />
                        ))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="serif text-[17px] leading-tight truncate">{game.title}</div>
                    </div>
                    {plat && (
                      <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium shrink-0">
                        {plat}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {groups.length === 0 && (
          <EmptyState title="Nothing matches" subtitle="Try a different filter." />
        )}
      </div>
    </div>
  );
}
