import { useMemo } from 'react';
import { TIER_COLOR_FOR_LABEL } from '../../data/constants.js';
import type { Game } from '../../types/index.js';

type TopTier = 'Masterpiece' | 'Amazing' | 'Great';
import { TIER } from '../../utils/gameHelpers.js';
import { GameCard } from '../cards/GameCard.js';
import { CoverFlowRow } from '../navigation/CoverFlowRow.js';

const TIER_ORDER: TopTier[] = ['Masterpiece', 'Amazing', 'Great'];

interface Top50ViewProps {
  games: Game[];
  onSelect: (game: Game) => void;
}

export function Top50View({ games, onSelect }: Top50ViewProps) {
  const groups = useMemo(() => {
    const list = games
      .filter((g) => g.topListRank != null)
      .sort((a, b) => (a.topListRank ?? 0) - (b.topListRank ?? 0));
    const buckets: Record<TopTier, Game[]> = {
      Masterpiece: [],
      Amazing: [],
      Great: [],
    };
    for (const g of list) {
      if (!g.rating) continue;
      const label = TIER(g.rating.total).label;
      if (label === 'Masterpiece' || label === 'Amazing' || label === 'Great') {
        buckets[label].push(g);
      }
    }
    return TIER_ORDER.filter((k) => buckets[k].length > 0).map((k) => ({
      key: k,
      games: buckets[k],
    }));
  }, [games]);

  return (
    <div className="space-y-4 pb-32">
      {groups.map((group) => (
        <div key={group.key}>
          <div
            className="serif text-[22px] mb-1 px-5"
            style={{ color: TIER_COLOR_FOR_LABEL[group.key] }}
          >
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
            flowKey={`top50-${group.key}`}
          />
        </div>
      ))}
    </div>
  );
}
