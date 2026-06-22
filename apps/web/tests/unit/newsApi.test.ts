import { describe, expect, it } from 'vitest';
import { matchLibraryGame } from '../../src/services/newsApi.js';
import type { Game, Headline } from '../../src/types/index.js';

const game = (id: string, title: string): Game => ({
  id,
  title,
  state: 'played',
});

const article = (title: string, excerpt = ''): Headline => ({
  id: title,
  title,
  url: 'https://example.com',
  excerpt,
  publishedAt: '2026-01-01T00:00:00Z',
  coverImage: null,
  source: 'Test',
  platforms: [],
  category: 'news',
});

describe('matchLibraryGame', () => {
  it('returns null when there are no games', () => {
    expect(matchLibraryGame(article('Anything'), [])).toBeNull();
  });

  it('returns null when the article is empty', () => {
    expect(matchLibraryGame(null, [game('a', 'Hollow Knight')])).toBeNull();
  });

  it('matches by punctuation-insensitive title', () => {
    const g = game('a', '007: First Light');
    expect(matchLibraryGame(article('Review: 007 First Light shines'), [g])).toBe(g);
  });

  it('prefers the longer title when multiple library games would match', () => {
    const mario = game('a', 'Mario');
    const bros = game('b', 'Super Mario Bros. Wonder');
    const result = matchLibraryGame(article('Super Mario Bros. Wonder review: a delight'), [
      mario,
      bros,
    ]);
    expect(result?.id).toBe('b');
  });

  it('searches the excerpt as well as the title', () => {
    const g = game('a', 'Death Stranding');
    expect(matchLibraryGame(article('Kojima news', 'plans for Death Stranding 2'), [g])).toBe(g);
  });

  it('ignores titles shorter than four characters to avoid noise', () => {
    const g = game('a', 'It');
    expect(matchLibraryGame(article('Quick news bit'), [g])).toBeNull();
  });

  it('returns null when there is no match', () => {
    expect(matchLibraryGame(article('Unrelated topic'), [game('a', 'Hollow Knight')])).toBeNull();
  });
});
