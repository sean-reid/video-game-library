import type { Game } from '../types/index.js';

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

export function importLibrary(setGames: (games: Game[]) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async (): Promise<void> => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data: unknown = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('Expected an array of games');
      if (!data.every(looksLikeGameRecord)) {
        throw new Error('File does not look like a Video Game Library export');
      }
      if (
        window.confirm(
          `Replace your current library with ${String(data.length)} games from this file? Your current data will be lost (export first if you want a backup).`,
        )
      ) {
        setGames(data);
      }
    } catch (e) {
      window.alert(`Could not import: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  input.click();
}
