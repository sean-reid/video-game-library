import type { Game } from '../../types/index.js';
import { parseExpected } from '../../utils/dateUtils.js';
import {
  TIER,
  effectiveCover,
  gradientFor,
  primaryPlatform,
  primaryYear,
} from '../../utils/gameHelpers.js';
import { Icon } from '../common/Icon.js';

interface GameCardProps {
  game: Game;
  onClick: () => void;
}

export function GameCard({ game, onClick }: GameCardProps) {
  const tier = game.rating ? TIER(game.rating.total) : null;
  const isTop50 = game.topListRank != null;
  const cover = effectiveCover(game);
  const hasCover = !!cover;

  // TOP-LEFT state tag (consistent across sections).
  let leftBadge: React.ReactNode = null;
  if (isTop50 && tier) {
    leftBadge = (
      <div
        className="glass-light rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase"
        style={{ color: tier.color }}
      >
        #{game.topListRank}
      </div>
    );
  } else if (game.state === 'playing') {
    leftBadge = (
      <div className="glass-light rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase text-emerald-300">
        Playing
      </div>
    );
  } else if (game.state === 'upcoming' && game.notes) {
    const noteText =
      game.notes.startsWith('Pre-ordered ') && !game.notes.includes('•')
        ? game.notes.replace('Pre-ordered ', 'Pre-ordered • ')
        : game.notes;
    leftBadge = (
      <div className="glass-light rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide text-zinc-200">
        {noteText}
      </div>
    );
  } else if (game.state === 'recommended') {
    const hrs = game.timeToBeat ?? game.rawgPlaytime;
    if (hrs) {
      leftBadge = (
        <div className="glass-light rounded-full px-2 py-0.5 text-[10px] font-medium text-zinc-200">
          ~{hrs} hrs
        </div>
      );
    }
  }

  // Bottom meta line — full date for Upcoming, year+platform for others.
  const plat = primaryPlatform(game);
  const year = primaryYear(game);
  let metaLine = '';
  if (game.state === 'upcoming') {
    const dateLabel = parseExpected(game.expectedDate).label;
    const dateIsRedundant = game.expectedDate === 'Available' || /^\d{4}$/.test(dateLabel);
    metaLine = dateIsRedundant ? plat : [dateLabel, plat].filter(Boolean).join(' · ');
  } else {
    metaLine = [year, plat].filter(Boolean).join(' · ');
  }

  // Playing also gets a HLTB-style playtime line under title.
  const showPlaytime = game.state === 'playing' && game.rawgPlaytime;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative group text-left w-full aspect-[3/4] rounded-2xl overflow-hidden grain"
      style={hasCover ? { background: '#0a0a0c' } : { background: gradientFor(game) }}
    >
      {hasCover && cover && (
        <img
          src={cover}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {hasCover && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/20" />
      )}
      <div className="absolute inset-0 flex flex-col justify-end p-3 gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {leftBadge}
            {game.completion?.platinum && (
              <div className="glass-light rounded-full p-1" title="Platinum">
                <Icon name="trophy" className="w-3 h-3" style={{ color: '#e2b878' }} />
              </div>
            )}
            {game.completion?.replayed && (
              <div className="glass-light rounded-full p-1" title="Replayed">
                <Icon name="replay" className="w-3 h-3" style={{ color: '#e2b878' }} />
              </div>
            )}
          </div>
          <div />
        </div>
        <div className="glass rounded-xl px-3 py-2.5">
          <div className="serif text-[17px] leading-[1.1] text-white line-clamp-2">
            {game.title}
          </div>
          {showPlaytime && (
            <div className="flex items-center gap-1 mt-1 text-[10px] uppercase tracking-wider text-zinc-300 font-medium">
              <Icon name="clock" className="w-2.5 h-2.5" />~{game.rawgPlaytime} hrs avg
            </div>
          )}
          {(metaLine || game.rating) && (
            <div className="flex items-start justify-between mt-1.5 gap-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-400 font-medium leading-tight">
                {metaLine}
              </div>
              {game.rating && tier && (
                <div
                  className="text-[13px] font-semibold tabular-nums shrink-0"
                  style={{ color: tier.color }}
                >
                  {game.rating.total}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
