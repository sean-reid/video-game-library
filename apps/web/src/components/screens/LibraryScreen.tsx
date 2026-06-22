import { useEffect, useMemo, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { Game } from '../../types/index.js';
import { Icon } from '../common/Icon.js';
import { SectionNav, type SectionId } from '../navigation/SectionNav.js';
import { TitleNav, type TopTab } from '../navigation/TitleNav.js';
import { PlayedView } from '../views/PlayedView.js';
import { PlayingView } from '../views/PlayingView.js';
import { RecommendedView } from '../views/RecommendedView.js';
import { RumoredView } from '../views/RumoredView.js';
import { Top50View } from '../views/Top50View.js';
import { UpcomingView } from '../views/UpcomingView.js';

export type LibrarySection = SectionId;
export type LibraryTab = TopTab;

export interface SavedScrolls {
  y: number;
  rows: Record<string, number>;
}

export interface EnrichStatus {
  active: boolean;
  done: number;
  total: number;
}

interface LibraryScreenProps {
  games: Game[];
  onSelect: (game: Game) => void;
  section: LibrarySection;
  setSection: (section: LibrarySection) => void;
  enrichStatus?: EnrichStatus;
  onAdd: () => void;
  onOpenBackup: () => void;
  onReorderRumored: (id: string, delta: number) => void;
  savedScrollsRef?: MutableRefObject<SavedScrolls | null>;
  tab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  addGame: (game: Game) => void;
  applyPatchToGame: (id: string, patch: Partial<Game>) => void;
}

export function LibraryScreen({
  games,
  onSelect,
  section,
  setSection,
  enrichStatus,
  onAdd,
  onOpenBackup,
  onReorderRumored,
  savedScrollsRef,
  tab,
  onTabChange,
  addGame,
  applyPatchToGame,
}: LibraryScreenProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!savedScrollsRef?.current) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const s = savedScrollsRef.current;
        if (!s) return;
        window.scrollTo(0, s.y);
        document.querySelectorAll<HTMLElement>('[data-flowkey]').forEach((el) => {
          const key = el.dataset.flowkey;
          if (!key) return;
          const x = s.rows[key];
          if (x != null) el.scrollLeft = x;
        });
        savedScrollsRef.current = null;
      });
    });
  }, []);

  const counts = useMemo(
    () => ({
      top50: games.filter((g) => g.topListRank != null).length,
      playing: games.filter((g) => g.state === 'playing').length,
      upcoming: games.filter((g) => g.state === 'upcoming').length,
      rumored: games.filter((g) => g.state === 'rumored').length,
      recommended: games.filter((g) => g.state === 'recommended').length,
      played: games.filter((g) => g.state === 'played').length,
    }),
    [games],
  );

  const filtered = useMemo(() => {
    if (!query) return games;
    const q = query.toLowerCase();
    return games.filter((g) => g.title.toLowerCase().includes(q));
  }, [games, query]);

  return (
    <div className="screen-enter">
      <div className="pt-safe">
        <div className="px-4 pt-5 pb-1 flex items-end justify-between">
          <TitleNav active={tab} onChange={onTabChange} />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenBackup}
              className="glass-light rounded-full p-2"
              aria-label="Backup & data"
            >
              <Icon name="settings" className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onAdd}
              className="glass-light rounded-full p-2"
              aria-label="Add game"
            >
              <Icon name="plus" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {enrichStatus?.active && (
          <div className="px-4 mt-1 text-[11px] text-zinc-500 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
            Fetching covers · {enrichStatus.done} of {enrichStatus.total}
          </div>
        )}

        <div className="px-4 pt-4">
          <div className="glass-light rounded-2xl flex items-center gap-2 px-3.5 py-2.5">
            <Icon name="search" className="w-4 h-4 text-zinc-400" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder="Search your library"
              className="bg-transparent flex-1 outline-none text-[15px] placeholder-zinc-500"
            />
          </div>
        </div>

        <SectionNav active={section} onChange={setSection} counts={counts} />

        {section === 'top50' && <Top50View games={filtered} onSelect={onSelect} />}
        {section === 'playing' && <PlayingView games={filtered} onSelect={onSelect} />}
        {section === 'upcoming' && <UpcomingView games={filtered} onSelect={onSelect} />}
        {section === 'rumored' && (
          <RumoredView games={filtered} onSelect={onSelect} onReorder={onReorderRumored} />
        )}
        {section === 'recommended' && (
          <RecommendedView
            games={filtered}
            onSelect={onSelect}
            addGame={addGame}
            applyPatchToGame={applyPatchToGame}
          />
        )}
        {section === 'played' && <PlayedView games={filtered} onSelect={onSelect} />}
      </div>
    </div>
  );
}
