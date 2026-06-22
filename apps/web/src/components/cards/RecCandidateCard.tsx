import type { RecCandidate } from '../../services/rawgApi.js';
import { gradientFor, pickBestPlatform, shortPlatform } from '../../utils/gameHelpers.js';

interface RecCandidateCardProps {
  candidate: RecCandidate;
  onClick: () => void;
}

export function RecCandidateCard({ candidate, onClick }: RecCandidateCardProps) {
  const cover = candidate.coverImage;
  const plat = shortPlatform(pickBestPlatform(candidate.platforms));
  const metaLine = [candidate.year, plat].filter(Boolean).join(' · ');
  const mc = candidate.metacritic;
  const mcColor =
    mc != null && mc >= 90 ? '#e2b878' : mc != null && mc >= 80 ? '#a8b4c0' : '#b87349';

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative group text-left w-full aspect-[3/4] rounded-2xl overflow-hidden grain"
      style={
        cover
          ? { background: '#0a0a0c' }
          : { background: gradientFor({ title: candidate.title, platform: plat }) }
      }
    >
      {cover && (
        <img
          src={cover}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {cover && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/20" />
      )}
      <div className="absolute inset-0 flex flex-col justify-end p-3 gap-1.5">
        <div className="flex items-center justify-between gap-2">
          {mc != null ? (
            <div
              className="glass-light rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
              style={{ color: mcColor }}
            >
              {mc}
            </div>
          ) : (
            <div />
          )}
          <div />
        </div>
        <div className="glass rounded-xl px-3 py-2.5">
          <div className="serif text-[17px] leading-[1.1] text-white line-clamp-2">
            {candidate.title}
          </div>
          {metaLine && (
            <div className="text-[10px] uppercase tracking-wide text-zinc-400 font-medium leading-tight mt-1.5">
              {metaLine}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
