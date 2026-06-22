import type { AtomEntry, RSSItem } from '../types';
import { parseDate } from '../utils/date';
import { cleanEntities, extractField, stripTags, truncate } from '../utils/html';

export function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const raw = m[1] ?? '';
    const title = extractField(raw, 'title');
    const link = extractField(raw, 'link');
    const desc = extractField(raw, 'description') || extractField(raw, 'content:encoded');
    const pubDate =
      extractField(raw, 'pubDate') ||
      extractField(raw, 'dc:date') ||
      extractField(raw, 'published');
    const enc = /<enclosure[^>]+url="([^"]+)"/.exec(raw);
    const media =
      /<media:content[^>]+url="([^"]+)"/i.exec(raw) ??
      /<media:thumbnail[^>]+url="([^"]+)"/i.exec(raw);
    const inlineImg = /<img[^>]+src="([^"]+)"/i.exec(desc);
    items.push({
      id: link || title,
      title: cleanEntities(title),
      url: link,
      excerpt: truncate(stripTags(desc), 220),
      publishedAt: parseDate(pubDate),
      coverImage: enc?.[1] ?? media?.[1] ?? inlineImg?.[1] ?? null,
    });
  }
  return items;
}

export function parseAtom(xml: string): AtomEntry[] {
  const items: AtomEntry[] = [];
  for (const m of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)) {
    const raw = m[1] ?? '';
    const title = extractField(raw, 'title');
    const linkMatch = /<link[^>]+href="([^"]+)"/.exec(raw);
    const link = linkMatch?.[1] ?? '';
    const published = extractField(raw, 'published') || extractField(raw, 'updated');
    // YouTube includes the video description inside <media:description>
    const description = extractField(raw, 'media:description');
    items.push({
      id: extractField(raw, 'yt:videoId') || link,
      title: cleanEntities(title),
      description: description ? cleanEntities(description) : '',
      url: link,
      publishedAt: parseDate(published),
    });
  }
  return items;
}
