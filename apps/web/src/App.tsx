import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import { LibraryScreen, type LibrarySection } from './components/screens/LibraryScreen.js';
import { AddGameSheet } from './components/sheets/AddGameSheet.js';
import { BackupSheet } from './components/sheets/BackupSheet.js';
import { EditGameSheet } from './components/sheets/EditGameSheet.js';
import { ImportConfirmSheet } from './components/sheets/ImportConfirmSheet.js';
import type { TopTab } from './components/navigation/TitleNav.js';
import { useGames } from './hooks/useGames.js';
import { useGistAutoSync } from './hooks/useGistAutoSync.js';
import { useGistVault } from './hooks/useGistVault.js';
import { usePodcastPlayer } from './hooks/usePodcastPlayer.js';
import { useRawgEnrichment } from './hooks/useRawgEnrichment.js';
import { hasLegacyGistConfig } from './services/gistApi.js';
import { exportLibrary, pickAndParseLibrary } from './services/libraryIO.js';
import type { Game } from './types/index.js';
import { buildNavOrder } from './utils/navOrder.js';

// Heavy screens load on demand. LibraryScreen stays eager because it's the
// landing tab; the others ship as their own chunks fetched when the user
// switches tabs / opens a detail. PodcastPlayer is gated on an active
// episode so the YouTube IFrame API is never pulled until playback starts.
const GameDetailScreen = lazy(() =>
  import('./components/screens/GameDetailScreen.js').then((m) => ({
    default: m.GameDetailScreen,
  })),
);
const NewsScreen = lazy(() =>
  import('./components/screens/NewsScreen.js').then((m) => ({ default: m.NewsScreen })),
);
const StatsScreen = lazy(() =>
  import('./components/screens/StatsScreen.js').then((m) => ({ default: m.StatsScreen })),
);
const PodcastPlayer = lazy(() =>
  import('./components/player/PodcastPlayer.js').then((m) => ({ default: m.PodcastPlayer })),
);

// Empty placeholder while a chunk loads — matches the screen-enter shell so
// there's no layout shift when the real screen mounts. The library is the
// only tab that flashes at boot, and that's eagerly imported.
function ScreenFallback() {
  return <div className="screen-enter pt-safe" aria-busy="true" />;
}

export function App() {
  const {
    games,
    setGames,
    addGame,
    updateGame,
    applyPatchToGame,
    toggleCompletion,
    deleteGame,
    reorderRumored,
  } = useGames();
  const [tab, setTab] = useState<TopTab>('library');
  const [section, setSection] = useState<LibrarySection>('top50');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const vault = useGistVault();
  const [hadLegacyConfig] = useState(hasLegacyGistConfig);

  const player = usePodcastPlayer();

  useGistAutoSync(games, vault.unlocked, vault.touchSyncedAt);
  const enrichStatus = useRawgEnrichment(games, applyPatchToGame);

  const existingIds = useMemo(() => new Set(games.map((g) => g.id)), [games]);
  const editGame = useMemo(() => games.find((g) => g.id === editId) ?? null, [games, editId]);
  const selected = useMemo(
    () => games.find((g) => g.id === selectedId) ?? null,
    [games, selectedId],
  );

  const handleDeleteGame = (id: string): void => {
    deleteGame(id);
    if (selectedId === id) setSelectedId(null);
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

  const navOrder = useMemo(() => buildNavOrder(games, section), [games, section]);
  const navIdx = selectedId ? navOrder.indexOf(selectedId) : -1;
  const hasPrev = navIdx > 0;
  const hasNext = navIdx >= 0 && navIdx < navOrder.length - 1;

  // Import flow stages the parsed games in App state and renders an
  // ImportConfirmSheet; replaces the native window.confirm the file picker
  // used to drop. The same sheet doubles as the parse-error surface.
  const [pendingImport, setPendingImport] = useState<Game[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const handleImport = (): void => {
    setBackupOpen(false);
    void pickAndParseLibrary().then(
      (games) => {
        if (games) setPendingImport(games);
      },
      (e: unknown) => {
        setImportError(e instanceof Error ? e.message : String(e));
      },
    );
  };
  const applyImport = (): void => {
    if (pendingImport) setGames(pendingImport);
    setPendingImport(null);
  };
  const dismissImportConfirm = (): void => {
    setPendingImport(null);
    setImportError(null);
  };

  return (
    <div className="min-h-screen bg-ink-950 text-zinc-100 max-w-md mx-auto relative">
      <Suspense fallback={<ScreenFallback />}>
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
                onPlayEpisode={player.playEpisode}
              />
            )}
            {tab === 'stats' && <StatsScreen games={games} tab={tab} onTabChange={setTab} />}
          </>
        )}
      </Suspense>

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
        onDelete={handleDeleteGame}
      />
      <BackupSheet
        open={backupOpen}
        onClose={() => {
          setBackupOpen(false);
        }}
        onExport={() => {
          exportLibrary(games);
        }}
        onImport={handleImport}
        games={games}
        setGames={setGames}
        vault={vault}
        hadLegacyConfig={hadLegacyConfig}
      />
      <ImportConfirmSheet
        open={pendingImport != null || importError != null}
        count={pendingImport?.length ?? null}
        error={importError}
        onConfirm={applyImport}
        onClose={dismissImportConfirm}
      />

      {player.playing && (
        <Suspense fallback={null}>
          <PodcastPlayer
            playing={player.playing}
            mode={player.mode}
            onMinimize={player.minimize}
            onExpand={player.expand}
            onClose={player.close}
          />
        </Suspense>
      )}
    </div>
  );
}
