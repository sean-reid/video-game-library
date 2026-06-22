import { useEffect, useRef, useState } from 'react';
import type { RawgSearchHit } from '../../services/rawgApi.js';
import { searchRawgList, yearOf } from '../../services/rawgApi.js';
import { pickBestPlatform, shortPlatform } from '../../utils/gameHelpers.js';
import { TextInput } from './inputs/TextInput.js';

interface RawgSearchProps {
  onPick: (hit: RawgSearchHit) => void;
  onSkip: () => void;
}

export function RawgSearch({ onPick, onSkip }: RawgSearchProps) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<RawgSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      searchRawgList(q, 6)
        .then(setResults)
        .catch(() => {
          setResults([]);
        })
        .finally(() => {
          setLoading(false);
        });
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  return (
    <div className="p-4 space-y-3">
      <TextInput
        autoFocus
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
        }}
        placeholder="Search RAWG by title…"
      />
      {loading && <div className="text-xs text-zinc-500 px-1">Searching…</div>}
      <div className="space-y-2">
        {results.map((r) => {
          const platforms = (r.platforms ?? [])
            .map((p): string | undefined => p.platform?.name)
            .filter((n): n is string => Boolean(n));
          const platLabel = shortPlatform(pickBestPlatform(platforms));
          const subtitle = [yearOf(r.released), platLabel].filter(Boolean).join(' · ');
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onPick(r);
              }}
              className="w-full flex items-center gap-3 p-2 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors text-left"
            >
              <div className="w-16 h-16 rounded-xl bg-ink-900 overflow-hidden shrink-0">
                {r.background_image && (
                  <img src={r.background_image} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="serif text-[16px] text-white leading-tight truncate">{r.name}</div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 mt-0.5">
                  {subtitle}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="w-full text-center text-[13px] text-zinc-500 underline-offset-2 hover:underline pt-2"
      >
        Add manually without RAWG (e.g. for rumored games)
      </button>
    </div>
  );
}
