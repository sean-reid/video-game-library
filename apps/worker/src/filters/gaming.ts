import type { Category, Platform } from '../types';

export function inferPlatforms(title: string, source: string): Platform[] {
  const t = title.toLowerCase();
  const set = new Set<Platform>();
  if (source === 'Nintendo Life') set.add('nintendo');
  if (source === 'PlayStation Blog' || source === 'Push Square') set.add('playstation');
  if (/\b(switch 2|switch|nintendo|joy-?con|pokem|pokém)/.test(t)) set.add('nintendo');
  if (/\b(ps5|ps4|playstation|sony|dualsense)\b/.test(t)) set.add('playstation');
  if (/\b(xbox|microsoft|series x|series s)\b/.test(t)) set.add('xbox');
  if (set.size === 0) set.add('multi');
  return [...set];
}

export function inferCategory(title: string): Category {
  const t = title.toLowerCase();
  if (/\breview\b|\b\d+\/10\b|\bverdict\b|hands-?on/.test(t)) return 'review';
  if (/\b(delay|launch|release date|reveal|trailer|coming|announce|unveil|preview)\b/.test(t))
    return 'upcoming';
  if (/\b(hardware|console|joy-?con|controller|patent|firmware|update|pro\b)/.test(t))
    return 'hardware';
  if (/\b(layoff|earnings|sales|million units|acqui|company|studio)\b/.test(t)) return 'company';
  return 'news';
}
