import { PODCAST_EPISODES, PODCAST_SOURCES } from '../config';
import { parseAtom } from '../parsers/rss';
import type { AtomEntry, PodcastBundle } from '../types';
import { fetchText } from '../utils/fetch';
import { cleanEpisodeTitle, resolveYouTubeChannelId } from '../youtube-resolver';

interface ChannelData {
  videos?: AtomEntry[];
  error?: string;
}

export async function fetchAllPodcasts(): Promise<PodcastBundle[]> {
  // 1) Resolve each unique handle to a channel ID.
  const handleToChannelId = new Map<string, string | null>();
  const uniqueHandles = [...new Set(PODCAST_SOURCES.map((p) => p.youtubeHandle).filter(Boolean))];
  await Promise.all(
    uniqueHandles.map(async (handle) => {
      try {
        handleToChannelId.set(handle, await resolveYouTubeChannelId(handle));
      } catch {
        // resolution failure leaves handle absent from the map
      }
    }),
  );

  // 2) Fetch each unique CHANNEL's RSS exactly once. Multiple shows that
  //    share a channel reuse the same fetch — avoids YouTube flakiness
  //    where two parallel requests to the same URL can return different
  //    statuses (one OK, one 404).
  const channelData = new Map<string, ChannelData>();
  const uniqueChannelIds = [
    ...new Set([...handleToChannelId.values()].filter((cid): cid is string => Boolean(cid))),
  ];
  await Promise.all(
    uniqueChannelIds.map(async (cid) => {
      try {
        const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`);
        channelData.set(cid, { videos: parseAtom(xml) });
      } catch (e) {
        channelData.set(cid, { error: String(e) });
      }
    }),
  );

  // 3) For each podcast, filter the shared video list by patterns. Match
  //    against TITLE ONLY (YouTube channel descriptions contain show-name
  //    boilerplate that would otherwise over-match).
  return PODCAST_SOURCES.map((pod): PodcastBundle => {
    const baseShape: PodcastBundle = {
      id: pod.id,
      show: pod.show,
      accent: pod.accent,
      coverGradient: pod.coverGradient,
      youtubeUrl: pod.youtubeUrl,
      spotifyUrl: pod.spotifyUrl,
      episodes: [],
    };
    const channelId = handleToChannelId.get(pod.youtubeHandle);
    if (!channelId) {
      baseShape.error = `Could not resolve channel ID for ${pod.youtubeHandle}`;
      return baseShape;
    }
    const data = channelData.get(channelId);
    if (!data || data.error) {
      baseShape.error = data?.error ?? 'No videos fetched';
      baseShape._debug = { channelId };
      return baseShape;
    }
    const videos = data.videos ?? [];

    const patterns = pod.titlePatterns
      .toLowerCase()
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    const matching = videos.filter((v) => {
      const title = v.title.toLowerCase();
      return patterns.some((p) => title.includes(p));
    });

    const primaryNeedle = patterns[0] ?? '';
    baseShape.episodes = matching.slice(0, PODCAST_EPISODES).map((v) => ({
      title: cleanEpisodeTitle(v.title, primaryNeedle),
      date: v.publishedAt.slice(0, 10),
      duration: '',
      youtubeUrl: v.url,
      spotifyUrl: pod.spotifyUrl,
      // Full video description so the client can parse chapter timestamps.
      // Capped to keep the JSON payload reasonable.
      description: v.description.slice(0, 4000),
    }));

    baseShape._debug = {
      channelId,
      patterns,
      totalVideos: videos.length,
      matchedCount: matching.length,
      recentVideoTitles: videos.slice(0, 10).map((v) => v.title),
    };
    return baseShape;
  });
}
