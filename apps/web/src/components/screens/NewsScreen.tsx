import { useMemo, useRef, useState } from 'react';
import { NEWS_STALE_MS } from '../../data/config.js';
import { useNews } from '../../hooks/useNews.js';
import {
  loadDismissed,
  loadRead,
  matchLibraryGame,
  saveDismissed,
  saveRead,
} from '../../services/newsApi.js';
import type { Game, Headline, PodcastBundle, PodcastEpisode } from '../../types/index.js';
import { timeAgo } from '../../utils/dateUtils.js';
import { HeadlineCard } from '../cards/HeadlineCard.js';
import { PodcastCard } from '../cards/PodcastCard.js';
import { EventBanner } from '../news/EventBanner.js';
import { NewsFilters, type NewsFilter } from '../news/NewsFilters.js';
import { SkeletonHeadlines, SkeletonPodcast } from '../news/NewsSkeletons.js';
import { RecentReleaseBanner } from '../news/RecentReleaseBanner.js';
import { TitleNav, type TopTab } from '../navigation/TitleNav.js';
import { PodcastListSheet } from '../sheets/PodcastListSheet.js';
import { ReaderSheet, articleKey } from '../sheets/ReaderSheet.js';

interface NewsScreenProps {
  games: Game[];
  onSelect: (game: Game) => void;
  tab: TopTab;
  onTabChange: (tab: TopTab) => void;
  onPlayEpisode: (pod: PodcastBundle, episode: PodcastEpisode) => void;
}

export function NewsScreen({ games, onSelect, tab, onTabChange, onPlayEpisode }: NewsScreenProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
  const [filter, setFilter] = useState<NewsFilter>('all');
  const [reader, setReader] = useState<Headline | null>(null);
  const [listPod, setListPod] = useState<PodcastBundle | null>(null);
  const [readArticles, setReadArticles] = useState<Set<string>>(loadRead);

  const markRead = (id: string): void => {
    if (!id) return;
    setReadArticles((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveRead(next);
      return next;
    });
  };

  const { news, loading, error, refresh, lastFetched } = useNews();
  const headlines = news?.headlines ?? [];
  const podcasts = news?.podcasts ?? [];
  const eventBanners = news?.events ?? [];

  const dismiss = (id: string): void => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  };

  const visibleEvents = eventBanners.filter((e) => !dismissed.has(e.id));

  const filtered = useMemo(() => {
    if (filter === 'all') return headlines;
    if (filter === 'library') return headlines.filter((a) => matchLibraryGame(a, games));
    if (filter === 'nintendo')
      return headlines.filter(
        (a) => a.platforms.includes('nintendo') || a.source === 'Nintendo Life',
      );
    if (filter === 'playstation')
      return headlines.filter(
        (a) =>
          a.platforms.includes('playstation') ||
          a.source === 'PlayStation Blog' ||
          a.source === 'Push Square',
      );
    return headlines.filter((a) => a.category === filter);
  }, [filter, headlines, games]);

  const openPodcast = (pod: PodcastBundle, episode?: PodcastEpisode): void => {
    const ep = episode ?? pod.episodes[0];
    if (!ep) return;
    onPlayEpisode(pod, ep);
    setListPod(null);
  };

  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>): void => {
    if (window.scrollY <= 0 && e.touches[0]) touchStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>): void => {
    if (touchStartY.current == null || !e.touches[0]) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0 && window.scrollY <= 0) {
      setPull(Math.min(dy * 0.5, 80));
    }
  };
  const onTouchEnd = (): void => {
    if (pull > 50) {
      setRefreshing(true);
      void refresh(true).finally(() => {
        setRefreshing(false);
      });
    }
    setPull(0);
    touchStartY.current = null;
  };

  const showFirstLoad = loading && headlines.length === 0;
  const cacheIsStale = !lastFetched || Date.now() - lastFetched > NEWS_STALE_MS;
  const showPodcastSkeleton = loading && (podcasts.length === 0 || cacheIsStale);

  return (
    <div
      ref={containerRef}
      className="screen-enter pt-safe pb-32"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {(pull > 8 || refreshing) && (
        <div
          className="flex items-center justify-center text-[11px] uppercase tracking-[0.2em] text-zinc-400 font-medium"
          style={{
            height: refreshing ? 48 : pull,
            transition: refreshing ? 'height 200ms ease-out' : 'none',
          }}
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full bg-gold mr-2 ${refreshing || pull > 50 ? 'animate-pulse' : ''}`}
          />
          {refreshing ? 'Refreshing…' : pull > 50 ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}

      <div className="px-4 pt-5 pb-1">
        <TitleNav active={tab} onChange={onTabChange} />
      </div>

      <RecentReleaseBanner
        games={games}
        onSelect={onSelect}
        dismissed={dismissed}
        onDismiss={dismiss}
      />
      {visibleEvents.map((e) => (
        <EventBanner key={e.id} event={e} onDismiss={dismiss} />
      ))}

      <div className="px-5 mt-6 mb-1">
        <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
          Today&apos;s podcasts
        </div>
      </div>
      {showPodcastSkeleton ? (
        <SkeletonPodcast />
      ) : podcasts.length === 0 ? (
        <div className="mx-4 mt-3 glass rounded-2xl p-4 text-sm text-zinc-500">
          No podcast episodes yet.
        </div>
      ) : (
        podcasts.map((p) => (
          <PodcastCard key={p.id} pod={p} onPlay={openPodcast} onViewAll={setListPod} />
        ))
      )}

      <div className="px-5 mt-7 mb-1 flex items-baseline justify-between">
        <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
          Latest headlines
        </div>
        {lastFetched && (
          <div className="text-[10px] text-zinc-600 tabular-nums">
            Updated {timeAgo(new Date(lastFetched).toISOString())}
          </div>
        )}
      </div>
      <NewsFilters active={filter} onChange={setFilter} />
      <div className="mx-4 glass rounded-3xl overflow-hidden divide-y divide-white/5">
        {showFirstLoad ? (
          <SkeletonHeadlines />
        ) : error && headlines.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 text-sm">
            Couldn&apos;t load news right now. Pull down to retry.
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 text-sm">
            No headlines match that filter.
          </div>
        ) : (
          filtered.map((a) => (
            <HeadlineCard
              key={a.id || a.url}
              article={a}
              onOpen={setReader}
              libraryMatch={matchLibraryGame(a, games)}
              isRead={readArticles.has(articleKey(a))}
            />
          ))
        )}
      </div>

      <PodcastListSheet
        open={Boolean(listPod)}
        pod={listPod}
        onClose={() => {
          setListPod(null);
        }}
        onPlay={openPodcast}
      />
      <ReaderSheet
        open={Boolean(reader)}
        item={reader}
        onClose={() => {
          setReader(null);
        }}
        onMarkRead={markRead}
      />
    </div>
  );
}
