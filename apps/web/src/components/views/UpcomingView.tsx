import { useMemo } from 'react';
import type { Game } from '../../types/index.js';
import { upcomingSortKey } from '../../utils/dateUtils.js';
import { GameCard } from '../cards/GameCard.js';
import { CoverFlowRow } from '../navigation/CoverFlowRow.js';

interface UpcomingViewProps {
  games: Game[];
  onSelect: (game: Game) => void;
}

export function UpcomingView({ games, onSelect }: UpcomingViewProps) {
  const groups = useMemo(() => {
    const list = games.filter((g) => g.state === 'upcoming');
    list.sort((a, b) => upcomingSortKey(a) - upcomingSortKey(b));

    const buckets: Record<string, Game[]> = {};
    for (const g of list) {
      const sk = upcomingSortKey(g);
      let key: string;
      if (sk === 0) key = 'Available now';
      else if (sk < 10000) key = 'TBD';
      else key = String(Math.floor(sk / 10000));
      (buckets[key] ??= []).push(g);
    }

    const yearKeys = Object.keys(buckets)
      .filter((k) => /^\d+$/.test(k))
      .sort();
    const ordered: string[] = [];
    if (buckets['Available now']) ordered.push('Available now');
    ordered.push(...yearKeys);
    if (buckets.TBD) ordered.push('TBD');

    return ordered.map((k) => ({ key: k, games: buckets[k] ?? [] }));
  }, [games]);

  return (
    <div className="space-y-4 pb-32">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="serif text-[22px] mb-1 px-5" style={{ color: '#d4a574' }}>
            {group.key}
            <span className="text-zinc-500 text-[14px] ml-2 tabular-nums">
              {group.games.length}
            </span>
          </div>
          <CoverFlowRow<Game>
            items={group.games}
            renderItem={(g) => (
              <GameCard
                game={g}
                onClick={() => {
                  onSelect(g);
                }}
              />
            )}
            flowKey={`upcoming-${group.key}`}
          />
        </div>
      ))}
    </div>
  );
}
