import { describe, expect, it } from 'vitest';
import { cleanEpisodeTitle } from '../src/youtube-resolver';

describe('cleanEpisodeTitle', () => {
  it('strips show name prefix when at position 0', () => {
    expect(cleanEpisodeTitle('Kinda Funny Games Daily - GTA VI', 'kinda funny games daily')).toBe(
      'GTA VI',
    );
  });

  it('strips leading date in mm-dd-yy form', () => {
    expect(cleanEpisodeTitle('05-29-26 - GTA VI date locked', 'irrelevant')).toBe(
      'GTA VI date locked',
    );
  });

  it('strips leading em-dash separator', () => {
    expect(cleanEpisodeTitle('— Headline goes here', 'irrelevant')).toBe('Headline goes here');
  });

  it('returns the original title if cleanup leaves nothing', () => {
    expect(cleanEpisodeTitle('Original', 'original')).toBe('Original');
  });

  it('leaves the title alone when no patterns match', () => {
    expect(cleanEpisodeTitle('Clean Title', 'no-match')).toBe('Clean Title');
  });
});
