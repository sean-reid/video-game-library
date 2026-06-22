import { useMemo } from 'react';
import type { Game } from '../../types/index.js';
import { Icon } from '../common/Icon.js';

interface RumoredViewProps {
  games: Game[];
  onSelect: (game: Game) => void;
  onReorder: (id: string, delta: number) => void;
}

export function RumoredView({ games, onSelect, onReorder }: RumoredViewProps) {
  const list = useMemo(() => games.filter((g) => g.state === 'rumored'), [games]);
  return (
    <div className="px-4 pb-32">
      <div className="glass rounded-3xl overflow-hidden divide-y divide-white/5">
        {list.map((game, i) => (
          <div
            key={game.id}
            className="w-full px-2 py-1.5 flex items-center gap-1 hover:bg-white/5 transition-colors"
          >
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => {
                  onReorder(game.id, -1);
                }}
                disabled={i === 0}
                className={`p-1 rounded ${i === 0 ? 'opacity-25' : 'hover:bg-white/10 active:bg-white/15'}`}
                aria-label="Move up"
              >
                <Icon name="arrowUp" className="w-3.5 h-3.5 text-zinc-400" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onReorder(game.id, 1);
                }}
                disabled={i === list.length - 1}
                className={`p-1 rounded ${i === list.length - 1 ? 'opacity-25' : 'hover:bg-white/10 active:bg-white/15'}`}
                aria-label="Move down"
              >
                <Icon name="arrowDown" className="w-3.5 h-3.5 text-zinc-400" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                onSelect(game);
              }}
              className="flex-1 text-left px-2 py-2 min-w-0"
            >
              <div className="serif text-[17px] leading-tight truncate">{game.title}</div>
              {game.notes && (
                <div className="text-[12px] text-zinc-500 mt-0.5 truncate">{game.notes}</div>
              )}
            </button>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium shrink-0 pr-2">
              TBD
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
