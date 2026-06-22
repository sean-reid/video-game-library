import { describe, expect, it } from 'vitest';
import { inferCategory, inferPlatforms } from '../../src/filters/gaming';

describe('inferPlatforms', () => {
  it('tags Nintendo Life source as nintendo regardless of title', () => {
    expect(inferPlatforms('General gaming update', 'Nintendo Life')).toContain('nintendo');
  });

  it('tags PlayStation Blog and Push Square as playstation', () => {
    expect(inferPlatforms('Any title', 'PlayStation Blog')).toContain('playstation');
    expect(inferPlatforms('Any title', 'Push Square')).toContain('playstation');
  });

  it('detects platform from title keywords', () => {
    expect(inferPlatforms('Switch 2 launch trailer', 'IGN')).toContain('nintendo');
    expect(inferPlatforms('New PS5 exclusive', 'IGN')).toContain('playstation');
    expect(inferPlatforms('Xbox Series X update', 'IGN')).toContain('xbox');
  });

  it('falls back to multi when nothing matches', () => {
    expect(inferPlatforms('Some unrelated news', 'IGN')).toEqual(['multi']);
  });
});

describe('inferCategory', () => {
  it('classifies reviews', () => {
    expect(inferCategory('Game Review: Hollow Knight')).toBe('review');
    expect(inferCategory('9/10 verdict on Silksong')).toBe('review');
    expect(inferCategory('Hands-on with new title')).toBe('review');
  });

  it('classifies upcoming announcements', () => {
    expect(inferCategory('Trailer reveals release date')).toBe('upcoming');
    expect(inferCategory('Delay announced for sequel')).toBe('upcoming');
  });

  it('classifies hardware news', () => {
    expect(inferCategory('New Joy-Con controller patent')).toBe('hardware');
    expect(inferCategory('Console firmware update')).toBe('hardware');
  });

  it('classifies company news', () => {
    expect(inferCategory('Studio layoffs hit publisher')).toBe('company');
    expect(inferCategory('Earnings report shows growth')).toBe('company');
  });

  it('defaults to news', () => {
    expect(inferCategory('Some unrelated headline')).toBe('news');
  });
});
