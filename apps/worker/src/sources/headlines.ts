import {
  GAMING_SIGNALS_RE,
  HEADLINES_PER_SOURCE,
  HEADLINES_TOTAL,
  NON_GAMING_TITLE_RE,
  NSFW_KEYWORDS,
  RSS_SOURCES,
  VICE_KEEP,
} from '../config';
import { inferCategory, inferPlatforms } from '../filters/gaming';
import { parseRSS } from '../parsers/rss';
import type { Headline } from '../types';
import { fetchText } from '../utils/fetch';

export async function fetchAllHeadlines(): Promise<Headline[]> {
  const results = await Promise.all(
    RSS_SOURCES.map(async (src): Promise<Headline[]> => {
      try {
        const xml = await fetchText(src.url);
        let items = parseRSS(xml);

        // Vice publishes everything under one feed — only keep gaming/tech URLs.
        if (src.source === 'Vice') {
          items = items.filter((it) => it.url && VICE_KEEP.test(it.url));
        }

        // Drop NSFW articles by title/excerpt keyword match.
        items = items.filter(
          (it) => !NSFW_KEYWORDS.test(it.title) && !NSFW_KEYWORDS.test(it.excerpt),
        );

        // Drop articles that are clearly NOT about video games (movies, TV
        // shows, comics, anime, music). Gaming signals override.
        items = items.filter((it) => {
          const haystack = `${it.title} ${it.excerpt}`;
          if (GAMING_SIGNALS_RE.test(haystack)) return true;
          return !NON_GAMING_TITLE_RE.test(it.title);
        });

        // Mixed-content sources: require an explicit gaming signal somewhere
        // in title/excerpt/URL. Drops Engadget's Apple/Google/Tesla coverage,
        // Polygon's movie/TV pieces, GamesRadar's entertainment posts, etc.
        if (!src.dedicated) {
          items = items.filter((it) =>
            GAMING_SIGNALS_RE.test(`${it.title} ${it.excerpt} ${it.url}`),
          );
        }

        items = items.slice(0, HEADLINES_PER_SOURCE);

        return (
          items
            .map(
              (it): Headline => ({
                ...it,
                source: src.source,
                platforms: inferPlatforms(it.title, src.source),
                category: inferCategory(it.title),
              }),
            )
            // Drop articles whose only platform is Xbox (user is PS + Switch).
            .filter((it) => !(it.platforms.length === 1 && it.platforms[0] === 'xbox'))
        );
      } catch {
        return [];
      }
    }),
  );
  const flat = results.flat();

  // Dedupe by URL — some articles cross-post across aggregators.
  const seen = new Set<string>();
  const unique = flat.filter((it) => {
    const key = (it.url || it.id || '').replace(/[#?].*$/, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return unique.slice(0, HEADLINES_TOTAL);
}
