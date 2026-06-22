import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import newsFixture from './fixtures/news.json' with { type: 'json' };

// Visual regression baselines for the bundled-via-Vite legacy app.
// Every UX-touching PR must keep these pixel-identical.

const ALLOWED_HOSTS = new Set([
  '127.0.0.1',
  'localhost',
  // Lora + Inter via Google Fonts. These don't change between runs and the
  // bundled app depends on them for the editorial look; allowing them here
  // is the minimum needed to keep the rendered text font-correct. PR 2.5
  // moves font hosting in-bundle and lets us drop this exception.
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  // Tailwind CDN — same story. PR 2.4 swaps in a build-time PostCSS
  // Tailwind and drops this allowance.
  'cdn.tailwindcss.com',
]);

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

// Inject a stylesheet that suppresses every <img> render. WebKit doesn't
// always intercept <img> subresource loads via page.route (cached responses
// can sneak through), so we hide them at the CSS layer instead. The
// card-gradient fallback is what we want to baseline against anyway since
// RAWG cover art is non-deterministic across runs.
async function hideImages(page: Page): Promise<void> {
  await page.addStyleTag({
    content: 'img { visibility: hidden !important; }',
  });
}

const SCREENS = [{ name: 'library-top50', path: '/', selector: 'body' }] as const;

for (const screen of SCREENS) {
  test(`baseline: ${screen.name}`, async ({ page }) => {
    await page.goto(screen.path);
    await page.waitForSelector(screen.selector);
    await hideImages(page);
    await page.waitForLoadState('networkidle');
    // Settle the grain animation + screen-enter transition.
    await page.waitForTimeout(500);
    // Mask the "Fetching covers · X of 153" indicator. It only appears
    // while the legacy RAWG enrichment loop is running and shows a
    // non-deterministic in-flight count under our blocked-network mocks.
    // The loop eventually exhausts the queue, but masking is faster and
    // robust across browsers regardless of how long the loop takes.
    const fetchingIndicator = page.getByText(/Fetching covers/);
    await expect(page).toHaveScreenshot(`${screen.name}.png`, {
      fullPage: false,
      animations: 'disabled',
      mask: [fetchingIndicator],
    });
  });
}
