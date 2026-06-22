import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import newsFixture from './fixtures/news.json' with { type: 'json' };

// Visual regression baselines for the bundled-via-Vite legacy app.
// Every UX-touching PR must keep these pixel-identical.

const ALLOWED_HOSTS = new Set([
  '127.0.0.1',
  'localhost',
  // Lora + Inter via Google Fonts. These don't change between runs and the
  // bundled app depends on them for the editorial look. PR 2.5 moves font
  // hosting in-bundle and lets us drop this exception.
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);
// RAWG (both api.rawg.io and media.rawg.io) is intentionally NOT in the
// allowlist. Letting search results through makes baselines flaky: RAWG's
// best-match for a given title can change as games are relisted, and the
// order of enrichment completion shifts the rendered cover-flow. The
// trade-off is gradient-only cards in the screenshots until a follow-up PR
// adds per-query response fixtures and seeds an already-enriched library
// into localStorage. Real cover art is visible in the live app via `pnpm
// --filter @vgl/web dev`.

test.beforeEach(async ({ page }) => {
  // Routes match in REVERSE registration order; register the catch-all
  // block first so the more-specific /news mock below takes priority.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (ALLOWED_HOSTS.has(url.hostname)) {
      await route.continue();
      return;
    }
    await route.abort();
  });

  // Stub the worker /news endpoint with a deterministic fixture.
  await page.route('**/vgl-news*.workers.dev/news*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(newsFixture),
    });
  });
});

// Hide the "Fetching covers · X of 153" enrichment indicator. Its counter
// ticks non-deterministically while the legacy enrichment loop runs against
// the blocked api.rawg.io search endpoint, so masking it is the only way to
// get stable screenshots. Found by text-content match so it's robust to
// class-name churn. Images themselves are no longer hidden — media.rawg.io
// URLs in COVER_OVERRIDES are content-addressed and stable.
async function hideEnrichmentIndicator(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('div')) {
      if (el.textContent?.startsWith('Fetching covers ·')) {
        el.style.display = 'none';
      }
    }
  });
}

const SCREENS = [{ name: 'library-top50', path: '/', selector: 'body' }] as const;

for (const screen of SCREENS) {
  test(`baseline: ${screen.name}`, async ({ page }) => {
    await page.goto(screen.path);
    await page.waitForSelector(screen.selector);
    await page.waitForLoadState('networkidle');
    // Settle the grain animation + screen-enter transition, then hide the
    // non-deterministic enrichment indicator just before snapshotting.
    await page.waitForTimeout(500);
    await hideEnrichmentIndicator(page);
    await expect(page).toHaveScreenshot(`${screen.name}.png`, {
      fullPage: false,
      animations: 'disabled',
    });
  });
}
