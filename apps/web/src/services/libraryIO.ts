import type { Game } from '../types/index.js';
import { reportError } from '../utils/reportError.js';

export function exportLibrary(games: Game[]): void {
  const blob = new Blob([JSON.stringify(games, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `video-game-library-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function looksLikeGameRecord(g: unknown): g is Game {
  if (!g || typeof g !== 'object') return false;
  const r = g as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.title === 'string' && typeof r.state === 'string';
}

// Opens the native file picker and resolves with the parsed library when
// the user picks a valid export. Resolves null when the user cancels the
// picker (no file selected). Rejects with a user-readable Error message
// when the picked file doesn't parse — the caller surfaces that.
//
// Unlike the previous version this no longer applies the games itself or
// drops a `window.confirm`; that flow is now handled in-app by the caller
// (App stages the parsed library and renders an ImportConfirmSheet).
export function pickAndParseLibrary(): Promise<Game[] | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = (): void => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      void (async (): Promise<void> => {
        try {
          const text = await file.text();
          const data: unknown = JSON.parse(text);
          if (!Array.isArray(data)) throw new Error('Expected an array of games');
          if (!data.every(looksLikeGameRecord)) {
            throw new Error('File does not look like a Video Game Library export');
          }
          resolve(data);
        } catch (e) {
          reportError('libraryIO.parseImport', e);
          reject(
            e instanceof Error ? e : new Error(typeof e === 'string' ? e : 'Could not import'),
          );
        }
      })();
    };
    input.click();
  });
}
