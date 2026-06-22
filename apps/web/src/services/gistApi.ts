import { GIST_KEY } from '../data/config.js';
import type { Game, StoredGistConfig } from '../types/index.js';

// Your library JSON lives in a private gist on YOUR GitHub account. The PAT
// is AES-GCM encrypted (passphrase-derived key, see services/cryptoStorage.ts)
// before it lands in localStorage; the cleartext token only exists in memory
// while the vault is unlocked. Nothing leaves the device except the writes
// to your own GitHub.

export const GIST_FILENAME = 'video-game-library.json';
const GH_API = 'https://api.github.com';

interface LegacyGistConfig {
  token?: string;
  gistId?: string;
  gistUrl?: string;
  lastSyncedAt?: number;
}

// Returns the stored config when it matches the current v2 (encrypted) shape.
// A legacy v1 config (cleartext token) is treated as absent so the user is
// prompted to reconnect with a passphrase rather than silently downgrading
// the security model.
export function loadGistConfig(): StoredGistConfig | null {
  try {
    const raw = localStorage.getItem(GIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredGistConfig | LegacyGistConfig;
    if ('version' in parsed && parsed.version === 2 && parsed.encrypted) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveGistConfig(config: StoredGistConfig): void {
  try {
    localStorage.setItem(GIST_KEY, JSON.stringify(config));
  } catch {
    /* quota or disabled storage — silently drop */
  }
}

// True when the previous (v1) cleartext-token config is still in localStorage
// and the user has not yet reconnected under the encrypted v2 shape. UI uses
// this to surface a "reconnect to encrypt your token" banner.
export function hasLegacyGistConfig(): boolean {
  try {
    const raw = localStorage.getItem(GIST_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as StoredGistConfig | LegacyGistConfig;
    return !('version' in parsed) || parsed.version !== 2;
  } catch {
    return false;
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
