import type { Env } from './env';
import { isDebug } from './env';
import { fetchAllEvents } from './sources/events';
import { fetchAllHeadlines } from './sources/headlines';
import { fetchAllPodcasts } from './sources/podcasts';
import type { NewsBundle } from './types';

export async function buildNewsBundle(env: Env): Promise<NewsBundle> {
  // Headlines feed BOTH the headlines list AND the event detection (so we can
  // catch a State of Play announcement that Wikipedia hasn't logged yet).
  const [headlines, podcasts] = await Promise.all([
    fetchAllHeadlines(),
    fetchAllPodcasts({ debug: isDebug(env) }),
  ]);
  const events = await fetchAllEvents(headlines);
  return {
    fetchedAt: new Date().toISOString(),
    headlines,
    podcasts,
    events,
  };
}
