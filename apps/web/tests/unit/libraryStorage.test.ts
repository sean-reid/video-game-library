import { describe, expect, it } from 'vitest';
import { rerankTop50 } from '../../src/services/libraryStorage.js';
import type { Game } from '../../src/types/index.js';

const ratedGame = (id: string, score: number, rank?: number): Game => ({
  id,
  title: id,
  state: 'played',
  rating: {
    total: score,
    narrative: 0,
    worldLevel: 0,
    gameplay: 0,
    art: 0,
    scoreAudio: 0,
    difficulty: 0,
    impact: 0,
    playTime: 0,
    emotional: 0,
    value: 0,
  },
  ...(rank != null ? { topListRank: rank } : {}),
});

describe('rerankTop50', () => {
  it('drops topListRank for games below the score floor', () => {
    const out = rerankTop50([ratedGame('a', 78, 1)]);
    expect(out[0]?.topListRank).toBeUndefined();
  });

  it('keeps games at or above the floor and re-ranks them by score', () => {
    const out = rerankTop50([ratedGame('a', 82, 3), ratedGame('b', 95, 1), ratedGame('c', 88, 2)]);
    const ranks = Object.fromEntries(out.map((g) => [g.id, g.topListRank]));
    expect(ranks).toEqual({ b: 1, c: 2, a: 3 });
  });

  it('breaks score ties by existing rank ascending', () => {
    const out = rerankTop50([ratedGame('a', 90, 2), ratedGame('b', 90, 1)]);
    expect(out.find((g) => g.id === 'b')?.topListRank).toBe(1);
    expect(out.find((g) => g.id === 'a')?.topListRank).toBe(2);
  });

  it('leaves non-Top-50 games untouched', () => {
    const out = rerankTop50([ratedGame('a', 92, 1), ratedGame('b', 70)]);
    expect(out.find((g) => g.id === 'b')?.topListRank).toBeUndefined();
  });

  it('compacts gaps when a game drops below the floor', () => {
    const out = rerankTop50([
      ratedGame('keep1', 95, 1),
      ratedGame('drop', 75, 2),
      ratedGame('keep2', 88, 3),
    ]);
    expect(out.find((g) => g.id === 'keep1')?.topListRank).toBe(1);
    expect(out.find((g) => g.id === 'keep2')?.topListRank).toBe(2);
    expect(out.find((g) => g.id === 'drop')?.topListRank).toBeUndefined();
  });
});
