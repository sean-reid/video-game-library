import { fetchText } from './utils/fetch';

const CHANNEL_ID_PATTERNS = [
  /"channelId":"(UC[\w-]{20,})"/,
  /"externalId":"(UC[\w-]{20,})"/,
  /<link\s+rel="canonical"\s+href="[^"]*\/channel\/(UC[\w-]{20,})"/,
  /\/channel\/(UC[\w-]{20,})/,
];

// Fetch a YouTube channel page and extract its channelId from the embedded
// metadata. Works with @handle URLs which don't expose the ID in their path.
export async function resolveYouTubeChannelId(handleOrUrl: string): Promise<string | null> {
  const url = handleOrUrl.startsWith('http')
    ? handleOrUrl
    : `https://www.youtube.com/${handleOrUrl.replace(/^\/+/, '')}`;
  const html = await fetchText(url);
  for (const re of CHANNEL_ID_PATTERNS) {
    const m = re.exec(html);
    if (m?.[1]) return m[1];
  }
  return null;
}

// "Kinda Funny Games Daily 05-29-26 — GTA VI date locked" → "GTA VI date locked"
export function cleanEpisodeTitle(title: string, showName: string): string {
  let t = title;
  if (showName) {
    const idx = t.toLowerCase().indexOf(showName.toLowerCase());
    if (idx === 0) t = t.slice(showName.length).trim();
  }
  t = t.replace(/^\s*\d{1,2}[-./]\d{1,2}[-./]\d{2,4}\s*/, '').trim();
  t = t.replace(/^[—–\-:|]\s*/, '').trim();
  return t || title;
}
