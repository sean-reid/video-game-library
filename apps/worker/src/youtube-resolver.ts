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

const DATE_RE = /\d{1,2}[-./]\d{1,2}[-./]\d{2,4}/;
const SEPARATOR_RE = /^[—–\-:|]\s*/;
const SEPARATOR_TRAILING_RE = /\s*[—–\-:|]\s*$/;

// Strip the show name plus any adjacent date from either the head or tail of a
// YouTube video title. Handles both legacy "Show 05-29-26 - Headline" and the
// current "Headline - Show 05.29.26" format.
//   "Kinda Funny Games Daily 05-29-26 — GTA VI date locked" → "GTA VI date locked"
//   "PlayStation Ditches PC - Kinda Funny Games Daily 06.19.26" → "PlayStation Ditches PC"
export function cleanEpisodeTitle(title: string, showName: string): string {
  if (!showName) return title;
  const lowerShow = showName.toLowerCase();
  let t = title;
  const lowerT = t.toLowerCase();

  const leading = lowerT.indexOf(lowerShow);
  if (leading === 0) {
    t = t.slice(showName.length).trim();
    t = t.replace(new RegExp(`^\\s*${DATE_RE.source}\\s*`), '').trim();
    t = t.replace(SEPARATOR_RE, '').trim();
    return t || title;
  }

  const trailing = lowerT.lastIndexOf(lowerShow);
  if (trailing > 0) {
    let head = t.slice(0, trailing).trim();
    const tail = t.slice(trailing + showName.length).trim();
    // If the tail is empty or just a date, strip the whole show+date suffix.
    if (!tail || new RegExp(`^${DATE_RE.source}$`).test(tail)) {
      head = head.replace(SEPARATOR_TRAILING_RE, '');
      return head || title;
    }
  }

  return title;
}
