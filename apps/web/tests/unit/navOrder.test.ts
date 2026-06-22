import { describe, expect, it } from 'vitest';
import { buildNavOrder } from '../../src/utils/navOrder.js';
import type { Game } from '../../src/types/index.js';

const g = (id: string, overrides: Partial<Game> = {}): Game => ({
  id,
  title: id,
  state: 'played',
  ...overrides,
});

describe('buildNavOrder', () => {
  const games: Game[] = [
    g('a', { state: 'played', year: 2023, topListRank: 2 }),
    g('b', { state: 'played', year: 2022 }),
    g('c', { state: 'playing' }),
    g('d', { state: 'upcoming', expectedDate: 'Fall 2026' }),
    g('e', { state: 'upcoming', expectedDate: 'H1 2026' }),
    g('f', { state: 'rumored' }),
    g('g', { state: 'recommended', year: 2025 }),
    g('h', { state: 'recommended', year: 2024 }),
    g('i', { state: 'played', topListRank: 1, year: 2024 }),
  ];

  it('top50 orders by topListRank ascending', () => {
    expect(buildNavOrder(games, 'top50')).toEqual(['i', 'a']);
  });

  it('playing returns only playing games', () => {
    expect(buildNavOrder(games, 'playing')).toEqual(['c']);
  });

  it('upcoming orders by parsed expected date', () => {
    expect(buildNavOrder(games, 'upcoming')).toEqual(['e', 'd']);
  });

  it('rumored preserves array order', () => {
    expect(buildNavOrder(games, 'rumored')).toEqual(['f']);
  });

  it('recommended orders by year descending', () => {
    expect(buildNavOrder(games, 'recommended')).toEqual(['g', 'h']);
  });

  it('played orders by year desc, ties broken by rank', () => {
    expect(buildNavOrder(games, 'played')).toEqual(['i', 'a', 'b']);
  });

  it('returns all ids when section is null', () => {
    expect(buildNavOrder(games, null)).toEqual(games.map((x) => x.id));
  });
});
