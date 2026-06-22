import { describe, expect, it } from 'vitest';
import {
  TIER,
  pickBestPlatform,
  primaryPlatform,
  primaryYear,
  shortPlatform,
} from '../../src/utils/gameHelpers.js';
import type { Game } from '../../src/types/index.js';

const game = (overrides: Partial<Game> = {}): Game => ({
  id: 'g1',
  title: 'Test',
  state: 'played',
  ...overrides,
});

describe('TIER', () => {
  it.each([
    [100, 'Masterpiece'],
    [150, 'Masterpiece'],
    [99, 'Amazing'],
    [90, 'Amazing'],
    [89, 'Great'],
    [80, 'Great'],
    [79, 'Good'],
    [70, 'Good'],
    [69, 'Mixed'],
    [0, 'Mixed'],
  ])('scores %i → %s', (score, label) => {
    expect(TIER(score).label).toBe(label);
  });
});

describe('pickBestPlatform', () => {
  it('returns empty string for missing input', () => {
    expect(pickBestPlatform(null)).toBe('');
    expect(pickBestPlatform(undefined)).toBe('');
    expect(pickBestPlatform([])).toBe('');
  });

  it('prefers PS5 over PS4 when both present', () => {
    expect(pickBestPlatform(['PlayStation 4', 'PlayStation 5'])).toBe('PlayStation 5');
  });

  it('prefers modern Nintendo over legacy', () => {
    expect(pickBestPlatform(['Nintendo Switch', 'Nintendo Switch 2'])).toBe('Nintendo Switch 2');
  });

  it('falls back to the first entry when none match priority', () => {
    expect(pickBestPlatform(['Some Obscure Console'])).toBe('Some Obscure Console');
  });
});

describe('primaryPlatform', () => {
  it('uses the user-supplied platform when present', () => {
    expect(primaryPlatform(game({ platform: 'PS5', rawgPlatforms: ['Xbox One'] }))).toBe('PS5');
  });

  it('falls back to RAWG short-form when user platform is empty', () => {
    expect(primaryPlatform(game({ rawgPlatforms: ['PlayStation 5'] }))).toBe('PS5');
  });

  it('returns empty string when neither is available', () => {
    expect(primaryPlatform(game())).toBe('');
  });
});

describe('shortPlatform', () => {
  it('shortens known RAWG names', () => {
    expect(shortPlatform('PlayStation 5')).toBe('PS5');
    expect(shortPlatform('Nintendo Switch 2')).toBe('Switch 2');
  });

  it('passes through unknown names', () => {
    expect(shortPlatform('PS5')).toBe('PS5');
    expect(shortPlatform('Weird Console')).toBe('Weird Console');
  });
});

describe('primaryYear', () => {
  it('prefers user-supplied year', () => {
    expect(primaryYear(game({ year: 2023, rawgReleased: '2019-01-15' }))).toBe(2023);
  });

  it('falls back to RAWG release date year', () => {
    expect(primaryYear(game({ rawgReleased: '2019-01-15' }))).toBe(2019);
  });

  it('returns null when neither is parseable', () => {
    expect(primaryYear(game())).toBeNull();
    expect(primaryYear(game({ rawgReleased: 'not-a-date' }))).toBeNull();
  });
});
