import { describe, expect, it } from 'vitest';
import { buildTasteProfile } from '../../src/services/recommendations.js';
import type { Game } from '../../src/types/index.js';

const rated = (overrides: Partial<Game> = {}): Game => ({
  id: overrides.id ?? 'g',
  title: overrides.title ?? 'Test',
  state: overrides.state ?? 'played',
  rating: overrides.rating ?? {
    total: 90,
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
  ...overrides,
});

describe('buildTasteProfile', () => {
  it('returns empty weights for an empty library', () => {
    const p = buildTasteProfile([]);
    expect(p.topPlatforms).toEqual([]);
    expect(p.topGenres).toEqual([]);
    expect(p.topDevelopers).toEqual([]);
    expect(p.topPublishers).toEqual([]);
  });

  it('weights platform by score for played/playing games', () => {
    const p = buildTasteProfile([
      rated({
        id: 'a',
        state: 'played',
        platform: 'PS5',
        rating: { ...sampleRating(95), total: 95 },
      }),
      rated({
        id: 'b',
        state: 'played',
        platform: 'PS5',
        rating: { ...sampleRating(80), total: 80 },
      }),
      rated({
        id: 'c',
        state: 'played',
        platform: 'Switch',
        rating: { ...sampleRating(70), total: 70 },
      }),
    ]);
    expect(p.platformWeights.PS5).toBe(175);
    expect(p.platformWeights.Switch).toBe(70);
    expect(p.topPlatforms[0]).toBe('PS5');
  });

  it('does not weight upcoming/rumored/recommended platforms', () => {
    const p = buildTasteProfile([
      rated({ id: 'a', state: 'upcoming', platform: 'PS5' }),
      rated({ id: 'b', state: 'rumored', platform: 'PS5' }),
    ]);
    expect(p.platformWeights.PS5).toBeUndefined();
  });

  it('adds a Top-50 bonus to genre weight', () => {
    const p = buildTasteProfile([
      rated({
        id: 'a',
        state: 'played',
        rating: { ...sampleRating(90), total: 90 },
        rawgGenres: ['action'],
        topListRank: 1,
      }),
      rated({
        id: 'b',
        state: 'played',
        rating: { ...sampleRating(90), total: 90 },
        rawgGenres: ['action'],
      }),
    ]);
    // 90 + 50 (top50 bonus) for the ranked one, +90 for the other = 230.
    expect(p.genreWeights.action).toBe(230);
  });

  it('ranks developers and publishers with a Top-50 edge', () => {
    const p = buildTasteProfile([
      rated({
        id: 'a',
        rawgDevelopers: ['kojima'],
        rawgPublishers: ['konami'],
        topListRank: 1,
      }),
      rated({
        id: 'b',
        rawgDevelopers: ['kojima'],
        rawgPublishers: ['sony'],
      }),
    ]);
    // 1 + 3 (edge) + 1 = 5
    expect(p.developerWeights.kojima).toBe(5);
    expect(p.publisherWeights.konami).toBe(4);
    expect(p.publisherWeights.sony).toBe(1);
  });

  it('caps the topN lists', () => {
    const games: Game[] = Array.from({ length: 10 }, (_, i) =>
      rated({
        id: `g${String(i)}`,
        rating: { ...sampleRating(80 + i), total: 80 + i },
        platform: `Plat${String(i)}`,
      }),
    );
    const p = buildTasteProfile(games);
    expect(p.topPlatforms).toHaveLength(5);
  });
});

function sampleRating(total: number) {
  return {
    total,
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
  };
}
