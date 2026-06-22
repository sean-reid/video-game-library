import { useEffect } from 'react';
import { STATE_META } from '../../data/constants.js';
import type { Completion, Game } from '../../types/index.js';
import { parseExpected, upcomingSortKey } from '../../utils/dateUtils.js';
import {
  TIER,
  effectiveCover,
  gradientFor,
  primaryPlatform,
  primaryYear,
} from '../../utils/gameHelpers.js';
import { RatingBreakdown } from '../charts/RatingBreakdown.js';
import { SpiderChart } from '../charts/SpiderChart.js';
import { Icon } from '../common/Icon.js';
import type { SectionId } from '../navigation/SectionNav.js';

export function buildNavOrder(games: Game[], section: SectionId | null | undefined): string[] {
  let list: Game[];
  switch (section) {
    case 'top50':
      list = games
        .filter((g) => g.topListRank != null)
        .sort((a, b) => (a.topListRank ?? 0) - (b.topListRank ?? 0));
      break;
    case 'playing':
      list = games.filter((g) => g.state === 'playing');
      break;
    case 'upcoming':
      list = games
        .filter((g) => g.state === 'upcoming')
        .sort((a, b) => upcomingSortKey(a) - upcomingSortKey(b));
      break;
    case 'rumored':
      list = games.filter((g) => g.state === 'rumored');
      break;
    case 'recommended':
      list = games
        .filter((g) => g.state === 'recommended')
        .sort((a, b) => (primaryYear(b) ?? 0) - (primaryYear(a) ?? 0));
      break;
    case 'played':
      list = games
        .filter((g) => g.state === 'played')
        .sort(
          (a, b) =>
            (b.year ?? 0) - (a.year ?? 0) || (a.topListRank ?? 999) - (b.topListRank ?? 999),
        );
      break;
    default:
      list = games;
  }
  return list.map((g) => g.id);
}

type CompletionKey = keyof Completion;

interface CompletionToggle {
  key: CompletionKey;
  label: string;
  icon: 'check' | 'trophy' | 'replay';
}

const COMPLETION_TOGGLES: CompletionToggle[] = [
  { key: 'story', label: 'Story', icon: 'check' },
  { key: 'platinum', label: 'Platinum', icon: 'trophy' },
  { key: 'replayed', label: 'Replayed', icon: 'replay' },
];

interface GameDetailScreenProps {
  game: Game;
  onBack: () => void;
  onEdit: () => void;
  onToggleCompletion: (id: string, key: CompletionKey) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function GameDetailScreen({
  game,
  onBack,
  onEdit,
  onToggleCompletion,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: GameDetailScreenProps) {
  const tier = game.rating ? TIER(game.rating.total) : null;
  const color = tier?.color ?? '#a1a1aa';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [game.id]);

  const cover = effectiveCover(game);
  const stateMeta = STATE_META[game.state];

  return (
    <div className="screen-enter pb-32">
      <div
        className="relative w-full aspect-[4/3] grain"
        style={cover ? { background: '#0a0a0c' } : { background: gradientFor(game) }}
      >
        {cover && (
          <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-ink-950" />
        <div className="absolute inset-0 flex flex-col pt-safe">
          <div className="flex items-center justify-between px-4 pt-3">
            <button type="button" onClick={onBack} className="glass-light rounded-full p-2.5">
              <Icon name="back" className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              {game.topListRank != null && tier && (
                <div className="glass rounded-full px-3 py-1.5 flex items-center gap-1.5">
                  <Icon name="star" filled className="w-3.5 h-3.5" style={{ color: tier.color }} />
                  <span
                    className="text-[12px] font-semibold tracking-wide"
                    style={{ color: tier.color }}
                  >
                    #{game.topListRank} of 50
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={onEdit}
                className="glass-light rounded-full p-2.5"
                aria-label="Edit game"
              >
                <Icon name="edit" className="w-5 h-5" />
              </button>
            </div>
          </div>

          {hasPrev && (
            <button
              type="button"
              onClick={onPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 glass-light rounded-full p-2.5 z-20"
              aria-label="Previous game"
            >
              <Icon name="back" className="w-5 h-5" />
            </button>
          )}
          {hasNext && (
            <button
              type="button"
              onClick={onNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 glass-light rounded-full p-2.5 z-20"
              aria-label="Next game"
            >
              <Icon name="back" className="w-5 h-5" style={{ transform: 'rotate(180deg)' }} />
            </button>
          )}

          <div className="mt-auto px-4 pb-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/60 font-medium mb-2">
              {[
                stateMeta?.label,
                primaryYear(game),
                primaryPlatform(game),
                game.expectedDate ? parseExpected(game.expectedDate).label : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <h1 className="serif text-[40px] leading-[0.95] text-white">{game.title}</h1>
            {game.state === 'playing' && game.rawgPlaytime && (
              <div className="mt-3 inline-flex items-center gap-1.5 glass-light rounded-full px-3 py-1.5">
                <Icon name="clock" className="w-3.5 h-3.5 text-zinc-300" />
                <span className="text-[12px] font-medium text-zinc-200">
                  ~{game.rawgPlaytime} hrs avg playtime
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {game.rating && tier ? (
        <>
          <div className="px-4 pt-6 pb-4">
            <div className="glass rounded-3xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    Total Score
                  </div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="serif text-[68px] leading-none" style={{ color }}>
                      {game.rating.total}
                    </span>
                    <span className="text-zinc-500 text-lg">/ 100</span>
                  </div>
                  <div
                    className="mt-1 text-[13px] font-medium uppercase tracking-wider"
                    style={{ color }}
                  >
                    {tier.label}
                  </div>
                </div>
              </div>

              <div className="mt-4 -mx-2">
                <SpiderChart rating={game.rating} color={color} />
              </div>
            </div>
          </div>

          <div className="px-4 pt-2">
            <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium mb-3">
              Breakdown
            </div>
            <div className="glass rounded-3xl p-5">
              <RatingBreakdown rating={game.rating} color={color} />
            </div>
          </div>

          <div className="px-4 pt-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                Status
              </div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium">
                Tap to toggle
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {COMPLETION_TOGGLES.map((f) => {
                const on = game.completion?.[f.key];
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => {
                      onToggleCompletion(game.id, f.key);
                    }}
                    className={`glass rounded-2xl p-3 flex flex-col items-center gap-1.5 transition-all active:scale-95 ${on ? 'ring-1 ring-white/15' : 'opacity-40'}`}
                    aria-pressed={Boolean(on)}
                  >
                    <Icon
                      name={f.icon}
                      className="w-5 h-5"
                      style={{ color: on ? color : '#71717a' }}
                    />
                    <div className="text-[11px] uppercase tracking-wider font-medium">
                      {f.label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="px-4 pt-6">
          <div className="glass rounded-3xl p-6">
            <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium mb-2">
              State
            </div>
            <div className="serif text-2xl text-zinc-100">{stateMeta?.label}</div>
            <div className="text-zinc-400 text-sm mt-1">{stateMeta?.verb}</div>
            {game.expectedDate && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                  Expected
                </div>
                <div className="serif text-xl mt-1" style={{ color: '#d4a574' }}>
                  {parseExpected(game.expectedDate).label}
                </div>
              </div>
            )}
            {game.timeToBeat && (
              <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
                <Icon name="clock" className="w-4 h-4 text-zinc-400" />
                <span className="text-sm text-zinc-300">~{game.timeToBeat} hours</span>
              </div>
            )}
            {game.notes && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium mb-1">
                  Notes
                </div>
                <div className="text-sm text-zinc-300">{game.notes}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
