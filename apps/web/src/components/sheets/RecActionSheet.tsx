import { useEffect } from 'react';
import type { RecCandidate } from '../../services/rawgApi.js';
import { gradientFor, pickBestPlatform, shortPlatform } from '../../utils/gameHelpers.js';

interface RecActionSheetProps {
  candidate: RecCandidate | null;
  onClose: () => void;
  onSave: () => void;
  onDismiss: () => void;
}

export function RecActionSheet({ candidate, onClose, onSave, onDismiss }: RecActionSheetProps) {
  useEffect(() => {
    if (!candidate) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [candidate]);

  if (!candidate) return null;
  const plat = shortPlatform(pickBestPlatform(candidate.platforms));
  const metaLine = [candidate.year, plat].filter(Boolean).join(' · ');

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      />
      <div className="relative mt-auto bg-ink-950 rounded-t-3xl border-t border-white/10 max-w-md mx-auto w-full pb-safe">
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-9 h-1 rounded-full bg-white/15" />
        </div>
        <div className="px-5 pt-3 pb-4 flex items-center gap-3 border-b border-white/5">
          <div
            className="w-14 h-[72px] rounded-lg overflow-hidden shrink-0"
            style={
              candidate.coverImage
                ? { background: '#0a0a0c' }
                : { background: gradientFor({ title: candidate.title, platform: plat }) }
            }
          >
            {candidate.coverImage && (
              <img src={candidate.coverImage} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="serif text-[18px] leading-tight text-white line-clamp-2">
              {candidate.title}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium mt-1">
              {metaLine}
              {candidate.metacritic != null && (
                <span className="ml-2 text-zinc-400">MC {candidate.metacritic}</span>
              )}
            </div>
          </div>
        </div>
        <div className="p-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={onSave}
            className="w-full rounded-2xl bg-white text-ink-950 py-3 text-[15px] font-medium"
          >
            Save for later
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="w-full rounded-2xl glass-light text-zinc-200 py-3 text-[15px] font-medium"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl text-zinc-500 py-3 text-[14px]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
