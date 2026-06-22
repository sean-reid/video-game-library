import { describe, expect, it } from 'vitest';
import { PODCAST_SOURCES } from '../src/config';
import { cleanEpisodeTitle } from '../src/youtube-resolver';
import { KF_RECENT_TITLES } from './fixtures/kf-videos';

describe('cleanEpisodeTitle', () => {
  it('strips leading show name plus an adjacent date and separator', () => {
    expect(
      cleanEpisodeTitle(
        'Kinda Funny Games Daily 05-29-26 - GTA VI date locked',
        'Kinda Funny Games Daily',
      ),
    ).toBe('GTA VI date locked');
    expect(
      cleanEpisodeTitle(
        'Kinda Funny Games Daily 05-29-26 — GTA VI date locked',
        'Kinda Funny Games Daily',
      ),
    ).toBe('GTA VI date locked');
  });

  it('strips trailing show name plus an adjacent date (current KF format)', () => {
    expect(
      cleanEpisodeTitle(
        'PlayStation Ditches PC, Welcomes AI - Kinda Funny Games Daily 06.19.26',
        'Kinda Funny Games Daily',
      ),
    ).toBe('PlayStation Ditches PC, Welcomes AI');
    expect(
      cleanEpisodeTitle(
        'GTA 6 Cover Art Revealed! - Kinda Funny Games Daily 6.18.26',
        'Kinda Funny Games Daily',
      ),
    ).toBe('GTA 6 Cover Art Revealed!');
  });

  it('strips trailing show name with no trailing date', () => {
    expect(
      cleanEpisodeTitle(
        '007 First Light FINAL Review - Kinda Funny Gamescast',
        'Kinda Funny Gamescast',
      ),
    ).toBe('007 First Light FINAL Review');
  });

  it('leaves the title alone when the show name appears mid-sentence', () => {
    expect(cleanEpisodeTitle('Watching Kinda Funny Gamescast live!', 'Kinda Funny Gamescast')).toBe(
      'Watching Kinda Funny Gamescast live!',
    );
  });

  it('returns the original title if cleanup would empty it', () => {
    expect(cleanEpisodeTitle('Original', 'original')).toBe('Original');
  });

  it('leaves the title alone when no patterns match', () => {
    expect(cleanEpisodeTitle('Clean Title', 'no-match')).toBe('Clean Title');
  });

  it('returns the title unchanged when showName is empty', () => {
    expect(cleanEpisodeTitle('Whatever', '')).toBe('Whatever');
  });
});

// Regression fixture: NOTES.md flagged 2026-06-04 podcast outage (0 episodes
// returned) and asked us to verify titlePatterns against real video titles.
// These assertions lock in that the configured patterns still match what KF
// actually publishes today.
describe('PODCAST_SOURCES titlePatterns vs real KF feed', () => {
  const daily = PODCAST_SOURCES.find((p) => p.id === 'kinda-funny-games-daily');
  const gamescast = PODCAST_SOURCES.find((p) => p.id === 'kinda-funny-gamescast');

  const matches = (title: string, patterns: string): boolean => {
    const haystack = title.toLowerCase();
    return patterns
      .toLowerCase()
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .some((p) => haystack.includes(p));
  };

  it('daily patterns match at least three recent KF videos', () => {
    if (!daily) throw new Error('daily source missing');
    const matched = KF_RECENT_TITLES.filter((t) => matches(t, daily.titlePatterns));
    expect(matched.length).toBeGreaterThanOrEqual(3);
  });

  it('gamescast patterns match at least three recent KF videos', () => {
    if (!gamescast) throw new Error('gamescast source missing');
    const matched = KF_RECENT_TITLES.filter((t) => matches(t, gamescast.titlePatterns));
    expect(matched.length).toBeGreaterThanOrEqual(3);
  });

  it('daily and gamescast patterns do not cross-match', () => {
    if (!daily || !gamescast) throw new Error('podcast source missing');
    for (const title of KF_RECENT_TITLES) {
      const inDaily = matches(title, daily.titlePatterns);
      const inGamescast = matches(title, gamescast.titlePatterns);
      expect(inDaily && inGamescast).toBe(false);
    }
  });
});
