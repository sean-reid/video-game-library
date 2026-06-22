import { expect, test } from '@playwright/test';
import podcastFixture from './fixtures/news-with-podcast.json' with { type: 'json' };

// Closes the silent-regression gap on PR sean-reid#51 (YouTube iframe
// sandbox + allow + referrerpolicy). The visual baselines don't exercise
// the player; this spec opens News, plays an episode, and asserts the
// iframe the YT IFrame API mounts carries the locked-down attributes.
//
// We don't depend on the real YouTube IFrame API loading (cross-origin and
// flaky). Instead a stub installed before navigation:
//   1. populates `window.YT.Player` with a constructor that synchronously
//      injects an `<iframe src="https://www.youtube.com/embed/<id>">` into
//      the host element and fires `onReady` next tick, and
//   2. ensures the player's `onReady` handler runs, which is where the
//      production code attaches `sandbox` / `allow` / `referrerpolicy`.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.continue();
      return;
    }
    await route.abort();
  });

  await page.route('**/vgl-news*.workers.dev/news*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(podcastFixture),
    });
  });

  // Install the YT stub before any app script runs. The `init` script
  // executes once per context navigation, including the first goto below.
  await page.addInitScript(() => {
    interface ReadyEvent {
      target: { getDuration: () => number; playVideo: () => void };
    }
    interface StateEvent {
      data: number;
      target: { getDuration: () => number };
    }
    interface PlayerOpts {
      videoId: string;
      events: {
        onReady: (e: ReadyEvent) => void;
        onStateChange: (e: StateEvent) => void;
        onError: () => void;
      };
    }
    class StubPlayer {
      constructor(host: HTMLElement, opts: PlayerOpts) {
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${opts.videoId}`;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        host.appendChild(iframe);
        const fakeTarget = {
          getDuration: () => 3600,
          playVideo: () => {
            /* no-op */
          },
        };
        // Fire onReady next tick so the component sets isReady=true and
        // applies the sandbox attributes to the iframe.
        setTimeout(() => {
          opts.events.onReady({ target: fakeTarget });
        }, 0);
      }
      destroy() {
        /* no-op */
      }
      loadVideoById() {
        /* no-op */
      }
      playVideo() {
        /* no-op */
      }
      pauseVideo() {
        /* no-op */
      }
      seekTo() {
        /* no-op */
      }
      getCurrentTime() {
        return 0;
      }
      getDuration() {
        return 3600;
      }
    }
    (window as unknown as { YT: { Player: typeof StubPlayer } }).YT = { Player: StubPlayer };
  });
});

test('podcast player mounts a sandboxed iframe when an episode is played', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Open News tab.
  await page.getByRole('button', { name: /^News$/ }).click();

  // The fixture's single episode renders a Play button inside its card.
  await page
    .getByRole('button', { name: /^Play$/ })
    .first()
    .click();

  // Expanded player sheet announces "Now playing".
  await expect(page.getByText('Now playing')).toBeVisible();

  // The YT stub mounts an iframe pointed at /embed/<id>; the production
  // onReady handler then attaches the locked-down attributes.
  const iframe = page.locator('iframe[src*="youtube.com/embed/"]');
  await expect(iframe).toHaveCount(1);
  await expect(iframe).toHaveAttribute(
    'sandbox',
    'allow-scripts allow-same-origin allow-presentation',
  );
  await expect(iframe).toHaveAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
  await expect(iframe).toHaveAttribute('referrerpolicy', 'origin');
});
