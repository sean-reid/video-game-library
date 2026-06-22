import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import newsFixture from './fixtures/news.json' with { type: 'json' };

// Visual regression baselines for the bundled-via-Vite legacy app.
// Every UX-touching PR must keep these pixel-identical.

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost']);
// Everything cross-origin is blocked at the route layer. Fonts (Lora +
// Inter) ship in the bundle via @fontsource. RAWG (both api.rawg.io and
// media.rawg.io) is intentionally blocked: letting search results through
// makes baselines flaky because RAWG's best-match for a given title can
// shift, and the order of enrichment completion shuffles the rendered
// cover-flow. The trade-off is gradient-only cards in the screenshots
// until a follow-up PR adds per-query response fixtures and seeds an
// already-enriched library into localStorage. Real cover art is visible
// in the live app via `pnpm --filter @vgl/web dev`.

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

// Hide every <img> + the "Fetching covers · X of 153" enrichment indicator.
//
// Images: WebKit's persistent disk cache (under ~/Library/WebKit/) holds
// RAWG cover bytes from earlier runs and serves them straight to <img> tags
// before page.route can abort the request. The result is non-deterministic
// covers appearing on some runs and not others. Card backgrounds use a
// gradient derived from `hash(game.title) % palette.length` plus a `120 +
// hash(game.title) % 80` angle (see `gradientFor` in the legacy app), so
// hiding the foreground <img> leaves a fully stable gradient render.
//
// Indicator: counter ticks non-deterministically while the legacy
// enrichment loop runs against the blocked api.rawg.io search endpoint.
async function hideNonDeterministicChrome(page: Page): Promise<void> {
  await page.addStyleTag({ content: 'img { visibility: hidden !important; }' });
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
    // non-deterministic chrome (cover images + enrichment indicator) just
    // before snapshotting.
    await page.waitForTimeout(500);
    await hideNonDeterministicChrome(page);
    await expect(page).toHaveScreenshot(`${screen.name}.png`, {
      fullPage: false,
      animations: 'disabled',
    });
  });
}
