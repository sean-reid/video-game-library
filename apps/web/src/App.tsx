import { useEffect, useMemo, useRef, useState } from 'react';
import { PodcastPlayer, type PlayerMode, type PlayingItem } from './components/player/PodcastPlayer.js';
import { GameDetailScreen, buildNavOrder } from './components/screens/GameDetailScreen.js';
import { LibraryScreen, type LibrarySection } from './components/screens/LibraryScreen.js';
import { NewsScreen } from './components/screens/NewsScreen.js';
import { StatsScreen } from './components/screens/StatsScreen.js';
import { AddGameSheet } from './components/sheets/AddGameSheet.js';
import { BackupSheet } from './components/sheets/BackupSheet.js';
import { EditGameSheet } from './components/sheets/EditGameSheet.js';
import type { TopTab } from './components/navigation/TitleNav.js';
import { loadGistConfig, saveGistConfig, updateGist } from './services/gistApi.js';
import { exportLibrary, importLibrary } from './services/libraryIO.js';
import { loadGames, rerankTop50, saveGames } from './services/libraryStorage.js';
import { searchRawg } from './services/rawgApi.js';
import type { Completion, Game, GistSyncConfig, PodcastBundle, PodcastEpisode } from './types/index.js';
import { parseExpected } from './utils/dateUtils.js';

interface EnrichStatus {
  active: boolean;
  done: number;
  total: number;
}

function targetYearOf(g: Game): number | null {
  if (g.year != null) return g.year;
  if (g.expectedDate) {
    const sk = parseExpected(g.expectedDate).sortKey;
    if (sk >= 10_000) return Math.floor(sk / 10_000);
  }
  return null;
}

export function App() {
  const [games, setGames] = useState<Game[]>(loadGames);
  const [tab, setTab] = useState<TopTab>('library');
  const [section, setSection] = useState<LibrarySection>('top50');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [gistConfig, setGistConfig] = useState<GistSyncConfig | null>(loadGistConfig);

  const [playingEpisode, setPlayingEpisode] = useState<PlayingItem | null>(null);
  const [playerMode, setPlayerMode] = useState<PlayerMode>('expanded');
  const playEpisode = (pod: PodcastBundle, episode: PodcastEpisode): void => {
    if (!episode) return;
    setPlayingEpisode({ pod, episode });
    setPlayerMode('expanded');
  };
  const closePlayer = (): void => {
    setPlayingEpisode(null);
  };

  const skipFirstGistSync = useRef(true);
  useEffect(() => {
    if (skipFirstGistSync.current) {
      skipFirstGistSync.current = false;
      return undefined;
    }
    if (!gistConfig) return undefined;
    const timer = setTimeout(() => {
      void (async (): Promise<void> => {
        try {
          await updateGist(gistConfig.token, gistConfig.gistId, games);
          const next: GistSyncConfig = { ...gistConfig, lastSyncedAt: Date.now() };
          saveGistConfig(next);
          setGistConfig(next);
        } catch (e) {
          console.warn('Gist auto-sync failed:', e);
        }
      })();
    }, 5000);
    return () => {
      clearTimeout(timer);
    };
  }, [games, gistConfig?.token, gistConfig?.gistId]);

  const [enrichStatus, setEnrichStatus] = useState<EnrichStatus>({
    active: false,
    done: 0,
    total: 0,
  });
  const enrichStartedRef = useRef(false);

  const existingIds = useMemo(() => new Set(games.map((g) => g.id)), [games]);
  const addGame = (g: Game): void => {
    setGames((prev) => rerankTop50([...prev, g]));
  };
  const updateGame = (g: Game): void => {
    setGames((prev) => rerankTop50(prev.map((x) => (x.id === g.id ? g : x))));
  };
  const applyPatchToGame = (id: string, patch: Partial<Game>): void => {
    setGames((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };
  const toggleCompletion = (id: string, key: keyof Completion): void => {
    setGames((prev) =>
      prev.map((g) =>
        g.id === id
          ? {
              ...g,
              completion: {
                story: false,
                platinum: false,
                replayed: false,
                ...(g.completion ?? {}),
                [key]: !g.completion?.[key],
              },
            }
          : g,
      ),
    );
  };
  const deleteGame = (id: string): void => {
    setGames((prev) => rerankTop50(prev.filter((x) => x.id !== id)));
    if (selectedId === id) setSelectedId(null);
  };
  const editGame = useMemo(
    () => games.find((g) => g.id === editId) ?? null,
    [games, editId],
  );

  const reorderRumored = (id: string, direction: number): void => {
    setGames((prev) => {
      const idx = prev.findIndex((g) => g.id === id);
      if (idx < 0) return prev;
      let neighborIdx = idx + direction;
      while (
        neighborIdx >= 0 &&
        neighborIdx < prev.length &&
        prev[neighborIdx]?.state !== 'rumored'
      ) {
        neighborIdx += direction;
      }
      if (neighborIdx < 0 || neighborIdx >= prev.length) return prev;
      const next = [...prev];
      const a = next[idx];
      const b = next[neighborIdx];
      if (!a || !b) return prev;
      next[idx] = b;
      next[neighborIdx] = a;
      return next;
    });
  };

  const savedScrollsRef = useRef<{ y: number; rows: Record<string, number> } | null>(null);
  const openDetail = (id: string): void => {
    const rows: Record<string, number> = {};
    document.querySelectorAll<HTMLElement>('[data-flowkey]').forEach((el) => {
      const key = el.dataset.flowkey;
      if (key) rows[key] = el.scrollLeft;
    });
    savedScrollsRef.current = { y: window.scrollY, rows };
    setSelectedId(id);
  };

  useEffect(() => {
    saveGames(games);
  }, [games]);

  useEffect(() => {
    if (enrichStartedRef.current) return undefined;
    enrichStartedRef.current = true;

    let cancelled = false;
    const snapshot = games;
    const toEnrich = snapshot.filter((g) => !g.rawgChecked && g.state !== 'rumored');
    if (toEnrich.length === 0) return undefined;

    setEnrichStatus({ active: true, done: 0, total: toEnrich.length });

    void (async (): Promise<void> => {
      let done = 0;
      for (const g of toEnrich) {
        if (cancelled) break;
        try {
          const match = await searchRawg(g.title, targetYearOf(g));
          const patch: Partial<Game> = match
            ? {
                coverImage: match.background_image ?? null,
                rawgId: match.id,
                rawgReleased: match.released ?? null,
                rawgPlatforms: (match.platforms ?? [])
                  .map((p) => p.platform?.name)
                  .filter((n): n is string => Boolean(n)),
                rawgPlaytime: match.playtime ?? null,
                rawgGenres: (match.genres ?? [])
                  .map((genre) => genre.slug)
                  .filter((s): s is string => Boolean(s)),
                rawgMetacritic: match.metacritic ?? null,
                rawgChecked: true,
              }
            : { rawgChecked: true };
          setGames((prev) => prev.map((x) => (x.id === g.id ? { ...x, ...patch } : x)));
        } catch (e) {
          console.warn('RAWG miss for', g.title, e);
        }
        done++;
        setEnrichStatus({ active: true, done, total: toEnrich.length });
        await new Promise((r) => setTimeout(r, 60));
      }
      setEnrichStatus({ active: false, done, total: toEnrich.length });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => games.find((g) => g.id === selectedId) ?? null,
    [games, selectedId],
  );

  const navOrder = useMemo(() => buildNavOrder(games, section), [games, section]);
  const navIdx = selectedId ? navOrder.indexOf(selectedId) : -1;
  const hasPrev = navIdx > 0;
  const hasNext = navIdx >= 0 && navIdx < navOrder.length - 1;

  return (
    <div className="min-h-screen bg-ink-950 text-zinc-100 max-w-md mx-auto relative">
      {selected ? (
        <GameDetailScreen
          game={selected}
          onBack={() => {
            setSelectedId(null);
          }}
          onEdit={() => {
            setEditId(selected.id);
          }}
          onToggleCompletion={toggleCompletion}
          onPrev={() => {
            if (hasPrev) {
              const prevId = navOrder[navIdx - 1];
              if (prevId) setSelectedId(prevId);
            }
          }}
          onNext={() => {
            if (hasNext) {
              const nextId = navOrder[navIdx + 1];
              if (nextId) setSelectedId(nextId);
            }
          }}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      ) : (
        <>
          {tab === 'library' && (
            <LibraryScreen
              games={games}
              onSelect={(g) => {
                openDetail(g.id);
              }}
              section={section}
              setSection={setSection}
              enrichStatus={enrichStatus}
              onAdd={() => {
                setAddOpen(true);
              }}
              onOpenBackup={() => {
                setBackupOpen(true);
              }}
              onReorderRumored={reorderRumored}
              savedScrollsRef={savedScrollsRef}
              tab={tab}
              onTabChange={setTab}
              addGame={addGame}
              applyPatchToGame={applyPatchToGame}
            />
          )}
          {tab === 'news' && (
            <NewsScreen
              games={games}
              onSelect={(g) => {
                openDetail(g.id);
              }}
              tab={tab}
              onTabChange={setTab}
              onPlayEpisode={playEpisode}
            />
          )}
          {tab === 'stats' && (
            <StatsScreen games={games} tab={tab} onTabChange={setTab} />
          )}
        </>
      )}

      <AddGameSheet
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
        }}
        onAdd={addGame}
        existingIds={existingIds}
      />
      <EditGameSheet
        open={Boolean(editId)}
        game={editGame}
        onClose={() => {
          setEditId(null);
        }}
        onSave={updateGame}
        onDelete={deleteGame}
      />
      <BackupSheet
        open={backupOpen}
        onClose={() => {
          setBackupOpen(false);
        }}
        onExport={() => {
          exportLibrary(games);
        }}
        onImport={() => {
          importLibrary(setGames);
        }}
        games={games}
        setGames={setGames}
        gistConfig={gistConfig}
        setGistConfig={setGistConfig}
      />

      <PodcastPlayer
        playing={playingEpisode}
        mode={playerMode}
        onMinimize={() => {
          setPlayerMode('mini');
        }}
        onExpand={() => {
          setPlayerMode('expanded');
        }}
        onClose={closePlayer}
      />
    </div>
  );
}
