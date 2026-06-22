import { GIST_KEY } from '../data/config.js';
import type { Game, GistSyncConfig } from '../types/index.js';

// Your library JSON lives in a private gist on YOUR GitHub account.
// Token + gist ID sit in localStorage today; encryption-at-rest happens in
// Phase 8.5. Nothing leaves the device except the writes to your own GitHub.

export const GIST_FILENAME = 'video-game-library.json';
const GH_API = 'https://api.github.com';

export function loadGistConfig(): GistSyncConfig | null {
  try {
    const raw = localStorage.getItem(GIST_KEY);
    if (raw) return JSON.parse(raw) as GistSyncConfig;
  } catch {
    /* corrupted entry — fall through to null */
  }
  return null;
}

export function saveGistConfig(config: GistSyncConfig): void {
  try {
    localStorage.setItem(GIST_KEY, JSON.stringify(config));
  } catch {
    /* quota or disabled storage — silently drop */
  }
}

export function clearGistConfig(): void {
  try {
    localStorage.removeItem(GIST_KEY);
  } catch {
    /* same as above */
  }
}

interface GistFile {
  content?: string;
  raw_url?: string;
  truncated?: boolean;
}

interface GistResponse {
  id: string;
  html_url?: string;
  files?: Record<string, GistFile>;
}

async function ghRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub ${String(res.status)}: ${text.slice(0, 200) || res.statusText}`);
  }
  return (await res.json()) as T;
}

export function createGist(token: string, games: Game[]): Promise<GistResponse> {
  return ghRequest<GistResponse>(token, '/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: 'Video Game Library backup',
      public: false,
      files: {
        [GIST_FILENAME]: { content: JSON.stringify(games, null, 2) },
      },
    }),
  });
}

export function updateGist(token: string, gistId: string, games: Game[]): Promise<GistResponse> {
  return ghRequest<GistResponse>(token, `/gists/${gistId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: { content: JSON.stringify(games, null, 2) },
      },
    }),
  });
}

export function fetchGist(token: string, gistId: string): Promise<GistResponse> {
  return ghRequest<GistResponse>(token, `/gists/${gistId}`);
}

export async function fetchGistLibrary(token: string, gistId: string): Promise<Game[]> {
  const gist = await fetchGist(token, gistId);
  const file = gist.files?.[GIST_FILENAME];
  if (!file) throw new Error(`No ${GIST_FILENAME} in this gist`);
  const content =
    file.truncated && file.raw_url ? await (await fetch(file.raw_url)).text() : file.content;
  if (!content) throw new Error('Empty gist file');
  const data = JSON.parse(content) as unknown;
  if (!Array.isArray(data)) throw new Error('Gist contents are not a valid library array');
  return data as Game[];
}
