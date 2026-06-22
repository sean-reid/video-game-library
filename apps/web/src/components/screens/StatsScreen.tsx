import { useMemo } from 'react';
import type { Game } from '../../types/index.js';
import { computeStats } from '../../utils/stats.js';
import { CompletionBars } from '../charts/CompletionBars.js';
import { PredictivenessRadar } from '../charts/PredictivenessRadar.js';
import { SectionCard } from '../charts/SectionCard.js';
import { StatTile } from '../charts/StatTile.js';
import { TierLegend, TierStackedBar } from '../charts/TierStackedBar.js';
import { TopFranchises } from '../charts/TopFranchises.js';
import { TitleNav, type TopTab } from '../navigation/TitleNav.js';

interface StatsScreenProps {
  games: Game[];
  tab: TopTab;
  onTabChange: (tab: TopTab) => void;
}

export function StatsScreen({ games, tab, onTabChange }: StatsScreenProps) {
  const stats = useMemo(() => computeStats(games), [games]);

  return (
    <div className="screen-enter pt-safe pb-32">
      <div className="px-4 pt-5 pb-1">
        <TitleNav active={tab} onChange={onTabChange} />
      </div>

      <div className="px-4 mt-5 grid grid-cols-2 gap-3">
        <StatTile
          label="Played"
          value={stats.totalPlayed}
          sub={stats.totalRated > 0 ? `${String(stats.totalRated)} rated` : null}
        />
        <StatTile
          label="Lifetime hours"
          value={stats.totalHours > 0 ? stats.totalHours.toLocaleString() : '—'}
          sub={stats.totalHours > 0 ? 'from RAWG' : 'no data yet'}
        />
      </div>

      <SectionCard
        title="Score vs. release year"
        subtitle="Tier breakdown of played games released 2017+"
      >
        <TierLegend />
        <TierStackedBar rows={stats.byYearTiers} labelWidth="3rem" />
      </SectionCard>

      <SectionCard title="Score vs. system" subtitle="Tier breakdown of played games by platform">
        <TierLegend />
        <TierStackedBar rows={stats.byPlatformTiers} labelWidth="5rem" />
      </SectionCard>

      <SectionCard title="Top franchises" subtitle="Series with 2 or more games in your library">
        <TopFranchises rows={stats.topFranchises} />
      </SectionCard>

      <SectionCard
        title="What you value"
        subtitle="Categories that distinguish Masterpieces from other Top 50 games"
      >
        <PredictivenessRadar
          predictiveness={stats.predictiveness}
          masterpiecesCount={stats.masterpiecesCount}
          otherCount={stats.otherTop50Count}
        />
      </SectionCard>

      <SectionCard title="Completion" subtitle={`${String(stats.totalRated)} rated games`}>
        <CompletionBars completion={stats.completion} totalRated={stats.totalRated} />
      </SectionCard>

      {stats.totalPlayed === 0 && (
        <div className="mx-4 mt-6 glass rounded-2xl p-6 text-center text-zinc-400 text-sm">
          Rate some games to start filling your Stats page.
        </div>
      )}
    </div>
  );
}
