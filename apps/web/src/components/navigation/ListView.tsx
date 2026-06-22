import type { ReactNode } from 'react';
import type { Game } from '../../types/index.js';

export interface ListGroup {
  key: string | null;
  games: Game[];
}

interface ListViewProps {
  groups: ListGroup[];
  formatRight?: (game: Game) => ReactNode;
  formatSubtitle?: (game: Game) => ReactNode;
  onSelect: (game: Game) => void;
  accentColor?: string;
}

export function ListView({
  groups,
  formatRight,
  formatSubtitle,
  onSelect,
  accentColor = '#d4a574',
}: ListViewProps) {
  return (
    <div className="px-4 space-y-6 pb-32">
      {groups.map((g) => (
        <div key={g.key ?? '__none__'}>
          {g.key !== null && (
            <div className="serif text-[22px] mb-2 px-1" style={{ color: accentColor }}>
              {g.key}
            </div>
          )}
          <div className="glass rounded-3xl overflow-hidden divide-y divide-white/5">
            {g.games.map((game) => {
              const subtitle = formatSubtitle?.(game);
              const right = formatRight?.(game);
              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => {
                    onSelect(game);
                  }}
                  className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/5 active:bg-white/10 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="serif text-[17px] leading-tight truncate">{game.title}</div>
                    {subtitle && (
                      <div className="text-[12px] text-zinc-500 mt-0.5 truncate">{subtitle}</div>
                    )}
                  </div>
                  {right && (
                    <div className="text-right shrink-0">
                      <div className="text-[12px] font-medium" style={{ color: accentColor }}>
                        {right}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
