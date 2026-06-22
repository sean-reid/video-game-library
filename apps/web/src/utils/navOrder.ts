import type { SectionId } from '../components/navigation/SectionNav.js';
import type { Game } from '../types/index.js';
import { upcomingSortKey } from './dateUtils.js';
import { RANK_SENTINEL, primaryYear } from './gameHelpers.js';

// Ordered list of game IDs for prev/next navigation inside the detail
// screen. Mirrors each section's own list order so the arrows feel like
// stepping through the row the user opened the game from. Kept in `utils/`
// so `App.tsx` can compute prev/next without dragging the whole
// `GameDetailScreen` chunk into the main bundle.
export function buildNavOrder(games: Game[], section: SectionId | null | undefined): string[] {
  let list: Game[];
  switch (section) {
    case 'top50':
      list = games
        .filter((g) => g.topListRank != null)
        .sort((a, b) => (a.topListRank ?? 0) - (b.topListRank ?? 0));
      break;
    case 'playing':
      list = games.filter((g) => g.state === 'playing');
      break;
    case 'upcoming':
      list = games
        .filter((g) => g.state === 'upcoming')
        .sort((a, b) => upcomingSortKey(a) - upcomingSortKey(b));
      break;
    case 'rumored':
      list = games.filter((g) => g.state === 'rumored');
      break;
    case 'recommended':
      list = games
        .filter((g) => g.state === 'recommended')
        .sort((a, b) => (primaryYear(b) ?? 0) - (primaryYear(a) ?? 0));
      break;
    case 'played':
      list = games
        .filter((g) => g.state === 'played')
        .sort(
          (a, b) =>
            (b.year ?? 0) - (a.year ?? 0) ||
            (a.topListRank ?? RANK_SENTINEL) - (b.topListRank ?? RANK_SENTINEL),
        );
      break;
    default:
      list = games;
  }
  return list.map((g) => g.id);
}
