import { useEffect, useMemo, useRef, useState } from 'react';
import { RECS_TTL_MS, STORAGE_KEY } from '../../data/config.js';
import {
  buildTasteProfile,
  enrichTop50Detail,
  loadRecs,
  saveRecs,
  type ApplyPatchFn,
  type RecsState,
} from '../../services/recommendations.js';
import { fetchRecommendations, type RecCandidate } from '../../services/rawgApi.js';
import type { Game } from '../../types/index.js';
import { primaryYear } from '../../utils/gameHelpers.js';
import { GameCard } from '../cards/GameCard.js';
import { RecCandidateCard } from '../cards/RecCandidateCard.js';
import { CoverFlowRow } from '../navigation/CoverFlowRow.js';
import { RecActionSheet } from '../sheets/RecActionSheet.js';

function candidateToGame(c: RecCandidate): Game {
  return {
    id: c.rawgId ? `rawg-${String(c.rawgId)}` : `manual-${String(Date.now())}`,
    title: c.title,
    state: 'recommended',
    notes: '',
    coverImage: c.coverImage ?? null,
    rawgId: c.rawgId,
    rawgReleased: c.released ?? null,
    rawgPlatforms: c.platforms,
    rawgPlaytime: c.playtime ?? null,
    rawgGenres: c.genres,
    rawgMetacritic: c.metacritic ?? null,
    rawgChecked: true,
    ...(c.year != null ? { year: c.year } : {}),
  };
}

interface RecommendedViewProps {
  games: Game[];
  onSelect: (game: Game) => void;
  addGame: (game: Game) => void;
  applyPatchToGame: ApplyPatchFn;
}

export function RecommendedView({
  games,
  onSelect,
  addGame,
  applyPatchToGame,
}: RecommendedViewProps) {
  const savedList = useMemo(() => {
    const ls = games.filter((g) => g.state === 'recommended');
    ls.sort((a, b) => (primaryYear(b) ?? 0) - (primaryYear(a) ?? 0));
    return ls;
  }, [games]);

  const [recsState, setRecsState] = useState<RecsState>(loadRecs);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCandidate, setActiveCandidate] = useState<RecCandidate | null>(null);
  const refreshStartedRef = useRef(false);

  const ownedRawgIds = useMemo(
    () => new Set(games.map((g) => g.rawgId).filter((id): id is number => id != null)),
    [games],
  );
  const dismissedSet = useMemo(() => new Set(recsState.dismissedIds), [recsState.dismissedIds]);

  const forYou = useMemo(
    () =>
      recsState.candidates
        .filter((c) => !ownedRawgIds.has(c.rawgId) && !dismissedSet.has(c.rawgId))
        .slice(0, 20),
    [recsState.candidates, ownedRawgIds, dismissedSet],
  );

  const refresh = async (): Promise<void> => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await enrichTop50Detail(games, applyPatchToGame);
      let liveGames: Game[] = games;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) liveGames = JSON.parse(raw) as Game[];
      } catch {
        /* fall back to props */
      }
      const profile = buildTasteProfile(liveGames);
      const candidates = await fetchRecommendations(profile);
      const next: RecsState = { ...recsState, fetchedAt: Date.now(), candidates };
      setRecsState(next);
      saveRecs(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load recommendations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (refreshStartedRef.current) return;
    refreshStartedRef.current = true;
    const stale = !recsState.fetchedAt || Date.now() - recsState.fetchedAt > RECS_TTL_MS;
    if (stale || recsState.candidates.length === 0) {
      void refresh();
    }
  }, []);

  const handleSave = (): void => {
    if (!activeCandidate) return;
    const g = candidateToGame(activeCandidate);
    if (g.rawgId == null || !ownedRawgIds.has(g.rawgId)) addGame(g);
    setActiveCandidate(null);
  };
  const handleDismiss = (): void => {
    if (!activeCandidate) return;
    const next: RecsState = {
      ...recsState,
      dismissedIds: [...new Set([...recsState.dismissedIds, activeCandidate.rawgId])],
    };
    setRecsState(next);
    saveRecs(next);
    setActiveCandidate(null);
  };

  const lastFetchedLabel = recsState.fetchedAt
    ? new Date(recsState.fetchedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : '';

  return (
    <div className="space-y-5 pb-32">
      <div>
        <div className="flex items-end justify-between px-5 mb-1">
          <div className="serif text-[22px]" style={{ color: '#d4a574' }}>
            For you
            {forYou.length > 0 && (
              <span className="text-zinc-500 text-[14px] ml-2 tabular-nums">
                {forYou.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              void refresh();
            }}
            disabled={loading}
            className="glass-light rounded-full px-3 py-1 text-[11px] uppercase tracking-wider text-zinc-300 font-medium disabled:opacity-50"
          >
            {loading
              ? 'Loading…'
              : lastFetchedLabel
                ? `Refresh · ${lastFetchedLabel}`
                : 'Refresh'}
          </button>
        </div>
        {error && <div className="px-5 text-[12px] text-rose-300/80">{error}</div>}
        {loading && forYou.length === 0 ? (
          <div className="px-5 py-6 text-[12px] text-zinc-500">
            Reading your library… fetching matching games from RAWG.
          </div>
        ) : forYou.length === 0 ? (
          <div className="px-5 text-[12px] text-zinc-500">
            {error ? '' : 'No matches yet — rate more games to build a profile.'}
          </div>
        ) : (
          <CoverFlowRow<RecCandidate>
            items={forYou}
            idKey="rawgId"
            renderItem={(c) => (
              <RecCandidateCard
                candidate={c}
                onClick={() => {
                  setActiveCandidate(c);
                }}
              />
            )}
            flowKey="recs-foryou"
          />
        )}
      </div>

      <div>
        <div className="serif text-[22px] mb-1 px-5" style={{ color: '#d4a574' }}>
          Saved for later
          {savedList.length > 0 && (
            <span className="text-zinc-500 text-[14px] ml-2 tabular-nums">
              {savedList.length}
            </span>
          )}
        </div>
        {savedList.length === 0 ? (
          <div className="px-5 text-[12px] text-zinc-500">
            Tap a &ldquo;For you&rdquo; card to save it here.
          </div>
        ) : (
          <CoverFlowRow<Game>
            items={savedList}
            renderItem={(g) => (
              <GameCard
                game={g}
                onClick={() => {
                  onSelect(g);
                }}
              />
            )}
            flowKey="recs-saved"
          />
        )}
      </div>

      <RecActionSheet
        candidate={activeCandidate}
        onClose={() => {
          setActiveCandidate(null);
        }}
        onSave={handleSave}
        onDismiss={handleDismiss}
      />
    </div>
  );
}
