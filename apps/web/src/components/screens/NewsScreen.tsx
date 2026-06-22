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
import type {
  EventItem,
  Game,
  Headline,
  PodcastBundle,
  PodcastEpisode,
} from '../../types/index.js';
import { parseExpected, timeAgo } from '../../utils/dateUtils.js';
import { primaryPlatform } from '../../utils/gameHelpers.js';
import { HeadlineCard } from '../cards/HeadlineCard.js';
import { PodcastCard } from '../cards/PodcastCard.js';
import { Icon } from '../common/Icon.js';
import { TitleNav, type TopTab } from '../navigation/TitleNav.js';
import { PodcastListSheet } from '../sheets/PodcastListSheet.js';
import { ReaderSheet, articleKey } from '../sheets/ReaderSheet.js';

type NewsFilter =
  | 'all'
  | 'library'
  | 'nintendo'
  | 'playstation'
  | 'review'
  | 'upcoming'
  | 'hardware';

const NEWS_FILTERS: { id: NewsFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'library', label: 'In Library' },
  { id: 'nintendo', label: 'Nintendo' },
  { id: 'playstation', label: 'PlayStation' },
  { id: 'review', label: 'Reviews' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'hardware', label: 'Hardware' },
];

interface NewsFiltersProps {
  active: NewsFilter;
  onChange: (id: NewsFilter) => void;
}

function NewsFilters({ active, onChange }: NewsFiltersProps) {
  return (
    <div className="px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar">
      {NEWS_FILTERS.map((f) => {
        const on = active === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              onChange(f.id);
            }}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
              on ? 'bg-white text-ink-950' : 'glass-light text-zinc-300'
            }`}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

interface RecentReleaseBannerProps {
  games: Game[];
  onSelect: (game: Game) => void;
  dismissed: Set<string>;
  onDismiss: (id: string) => void;
}

function RecentReleaseBanner({
  games,
  onSelect,
  dismissed,
  onDismiss,
}: RecentReleaseBannerProps) {
  const recent = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 14 * 86_400_000);
    return games.filter((g) => {
      if (g.state !== 'upcoming') return false;
      const ed = g.expectedDate;
      if (!ed) return false;
      if (ed === 'Available') return true;
      const md = /^(\d{1,2})\/(\d{1,2})$/.exec(ed);
      if (md && md[1] && md[2]) {
        const date = new Date(
          now.getFullYear(),
          parseInt(md[1], 10) - 1,
          parseInt(md[2], 10),
        );
        return date <= now && date >= cutoff;
      }
      return false;
    });
  }, [games]);

  const visible = recent.filter((g) => !dismissed.has(`release-${g.id}`));
  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((g) => {
        const exp = parseExpected(g.expectedDate);
        const plat = primaryPlatform(g);
        return (
          <div
            key={g.id}
            className="mx-4 mt-3 rounded-2xl overflow-hidden grain relative"
            style={{ background: 'linear-gradient(135deg, #78350f 0%, #1c1917 100%)' }}
          >
            <div className="p-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  onSelect(g);
                }}
                className="min-w-0 flex-1 text-left"
              >
                <div
                  className="text-[10px] uppercase tracking-[0.22em] font-medium"
                  style={{ color: '#e2b878' }}
                >
                  Recently Released
                </div>
                <div className="serif text-[20px] text-white leading-tight mt-0.5 truncate">
                  {g.title}
                </div>
                <div className="text-[12px] text-zinc-300 mt-1 tabular-nums truncate">
                  {exp.label}
                  {plat ? ` · ${plat}` : ''}
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  onDismiss(`release-${g.id}`);
                }}
                className="glass-light rounded-full p-2 shrink-0"
                aria-label="Dismiss"
              >
                <Icon name="close" className="w-4 h-4 text-zinc-300" />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

interface EventBannerProps {
  event: EventItem;
  onDismiss: (id: string) => void;
}

function EventBanner({ event, onDismiss }: EventBannerProps) {
  const palette =
    event.type === 'nintendo'
      ? { from: '#7f1d1d', to: '#1c1917', label: 'NINTENDO' }
      : { from: '#1e3a8a', to: '#0f172a', label: 'PLAYSTATION' };
  return (
    <div
      className="mx-4 mt-3 rounded-2xl overflow-hidden grain relative"
      style={{ background: `linear-gradient(135deg, ${palette.from} 0%, ${palette.to} 100%)` }}
    >
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.22em] font-medium"
            style={{ color: event.accent }}
          >
            {palette.label}
          </div>
          <div className="serif text-[20px] text-white leading-tight mt-0.5">{event.title}</div>
          <div className="text-[12px] text-zinc-300 mt-1 tabular-nums">
            {event.date} · {event.time}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onDismiss(event.id);
          }}
          className="glass-light rounded-full p-2 shrink-0"
          aria-label="Dismiss"
        >
          <Icon name="close" className="w-4 h-4 text-zinc-300" />
        </button>
      </div>
    </div>
  );
}

function SkeletonPodcast() {
  return (
    <div className="mx-4 mt-3 glass rounded-2xl overflow-hidden animate-pulse">
      <div className="flex">
        <div className="w-24 h-28 shrink-0 bg-white/5" />
        <div className="flex-1 p-3.5 space-y-2">
          <div className="h-2.5 w-16 bg-white/5 rounded" />
          <div className="h-3 w-5/6 bg-white/8 rounded" />
          <div className="h-2 w-3/4 bg-white/5 rounded" />
          <div className="flex gap-2 mt-2">
            <div className="h-5 w-16 bg-white/5 rounded-full" />
            <div className="h-5 w-16 bg-white/5 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonHeadlines() {
  return (
    <div className="animate-pulse">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="p-3 flex items-start gap-3 border-b border-white/5 last:border-b-0"
        >
          <div className="w-20 h-20 rounded-xl bg-white/5 shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-2.5 w-24 bg-white/5 rounded" />
            <div className="h-3 w-11/12 bg-white/8 rounded" />
            <div className="h-3 w-4/5 bg-white/8 rounded" />
            <div className="h-2 w-3/4 bg-white/5 rounded mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface NewsScreenProps {
  games: Game[];
  onSelect: (game: Game) => void;
  tab: TopTab;
  onTabChange: (tab: TopTab) => void;
  onPlayEpisode: (pod: PodcastBundle, episode: PodcastEpisode) => void;
}

export function NewsScreen({
  games,
  onSelect,
  tab,
  onTabChange,
  onPlayEpisode,
}: NewsScreenProps) {
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
  const onTouchEnd = async (): Promise<void> => {
    if (pull > 50) {
      setRefreshing(true);
      try {
        refresh(true);
      } finally {
        setRefreshing(false);
      }
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
      onTouchEnd={() => {
        void onTouchEnd();
      }}
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
