// YouTube IFrame API helpers. Lock-screen / background playback for a
// YouTube iframe is a documented platform wall on iOS — see legacy player
// notes — so this module does not attempt to work around it.

export interface ChapterMark {
  time: number;
  label: string;
}

export function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/.exec(url);
  return m?.[1] ?? null;
}

export function formatPlayerTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const total = Math.floor(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${String(h)}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m)}:${String(sec).padStart(2, '0')}`;
}

// Parse chapter timestamps out of a YouTube video description. Matches lines
// that start with a timestamp (m:ss / mm:ss / h:mm:ss), optionally wrapped
// in parens, followed by a label. Needs ≥2 to count as a real chapter list.
export function parseChapters(description: string | null | undefined): ChapterMark[] {
  if (!description) return [];
  const out: ChapterMark[] = [];
  for (const rawLine of description.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = /^\(?(\d{1,2}):(\d{2})(?::(\d{2}))?\)?\s*[-–—:.)\]]*\s*(\S.*)$/.exec(line);
    if (!m?.[1] || !m[2] || !m[4]) continue;
    let secs: number;
    if (m[3] !== undefined) {
      secs = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    } else {
      secs = Number(m[1]) * 60 + Number(m[2]);
    }
    const label = m[4].trim().replace(/\s{2,}/g, ' ');
    if (label) out.push({ time: secs, label });
  }
  // De-dup by timestamp (keep first), sort ascending, cap at 80.
  const seen = new Set<number>();
  const deduped = out.filter((c) => (seen.has(c.time) ? false : (seen.add(c.time), true)));
  deduped.sort((a, b) => a.time - b.time);
  return deduped.length >= 2 ? deduped.slice(0, 80) : [];
}

export function youtubeUrlAt(videoUrl: string | null | undefined, secs: number): string {
  const id = extractYouTubeId(videoUrl);
  if (!id) return videoUrl ?? '';
  const t = Math.max(0, Math.floor(secs));
  return `https://www.youtube.com/watch?v=${id}${t ? `&t=${String(t)}s` : ''}`;
}

// Loads the YouTube IFrame API exactly once. Resolves when window.YT.Player
// is callable. Idempotent — repeated calls share the same promise.
type WindowWithYT = Window & {
  YT?: { Player?: unknown };
  onYouTubeIframeAPIReady?: () => void;
};

let ytApiPromise: Promise<void> | null = null;

export function loadYouTubeApi(): Promise<void> {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const w = window as WindowWithYT;
    if (w.YT?.Player) {
      resolve();
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.id = 'yt-iframe-api';
    document.body.appendChild(tag);
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve();
    };
  });
  return ytApiPromise;
}
