import {
  COVER_OVERRIDES,
  DEFAULT_PALETTE,
  PLATFORM_PALETTES,
  PLATFORM_PRIORITY,
  PLATFORM_SHORT,
} from '../data/platforms.js';
import type { Game, TierLabel } from '../types/index.js';

// Deterministic string-to-int hash for generative gradients.
export function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface Tier {
  label: TierLabel;
  color: string;
}

// Medal-style tier descriptor (gold / silver / bronze + below).
export function TIER(score: number): Tier {
  if (score >= 100) return { label: 'Masterpiece', color: '#e2b878' }; // rich gold
  if (score >= 90) return { label: 'Amazing', color: '#a8b4c0' }; // cool silver
  if (score >= 80) return { label: 'Great', color: '#b87349' }; // warm bronze
  if (score >= 70) return { label: 'Good', color: '#5d6770' };
  return { label: 'Mixed', color: '#4a5260' };
}

export function gradientFor(game: Pick<Game, 'platform' | 'title'>): string {
  const matched = game.platform
    ? PLATFORM_PALETTES[game.platform as keyof typeof PLATFORM_PALETTES]
    : undefined;
  const palettes = matched ?? DEFAULT_PALETTE;
  const [a, b] = palettes[hash(game.title) % palettes.length] ?? palettes[0]!;
  const angle = 120 + (hash(game.title) % 80);
  return `linear-gradient(${String(angle)}deg, ${a} 0%, ${b} 100%)`;
}

// Resolve the effective cover URL — manual override beats RAWG match.
export function effectiveCover(game: Game): string | null {
  const overrides = COVER_OVERRIDES as Record<string, { coverImage: string }>;
  return overrides[game.id]?.coverImage ?? game.coverImage ?? null;
}

export function shortPlatform(name: string): string {
  return PLATFORM_SHORT[name as keyof typeof PLATFORM_SHORT] ?? name;
}

// Preferred RAWG platform from a multi-platform release. Falls back to the
// first entry when nothing in PLATFORM_PRIORITY matches (weird/regional/old).
export function pickBestPlatform(platforms: string[] | undefined | null): string {
  if (!platforms || platforms.length === 0) return '';
  for (const p of PLATFORM_PRIORITY) {
    if (platforms.includes(p)) return p;
  }
  return platforms[0] ?? '';
}

// User-supplied platform wins; otherwise the best RAWG platform, normalised.
// Empty-string platform (user cleared the field) falls through to RAWG.
export function primaryPlatform(game: Game): string {
  if (game.platform) return game.platform;
  if (!game.rawgPlatforms) return '';
  return shortPlatform(pickBestPlatform(game.rawgPlatforms));
}

// User-supplied year wins; otherwise parse from RAWG release date.
export function primaryYear(game: Game): number | null {
  if (game.year) return game.year;
  if (game.rawgReleased) {
    const y = parseInt(String(game.rawgReleased).slice(0, 4), 10);
    return isNaN(y) ? null : y;
  }
  return null;
}
