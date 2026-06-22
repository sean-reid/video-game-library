import { useMemo } from 'react';
import type { Game } from '../../types/index.js';
import { GameCard } from '../cards/GameCard.js';
import { EmptyState } from '../common/EmptyState.js';

interface PlayingViewProps {
  games: Game[];
  onSelect: (game: Game) => void;
}

export function PlayingView({ games, onSelect }: PlayingViewProps) {
  const list = useMemo(() => games.filter((g) => g.state === 'playing'), [games]);
  if (list.length === 0) {
    return (
      <EmptyState
        title="Not playing anything"
        subtitle="Move a game from Upcoming or Recommended to Playing."
      />
    );
  }
  return (
    <div className="px-4 pb-32 grid grid-cols-2 gap-3">
      {list.map((g) => (
        <GameCard
          key={g.id}
          game={g}
          onClick={() => {
            onSelect(g);
          }}
        />
      ))}
    </div>
  );
}
