import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Sequential by default so screenshots aren't racing for the same port.
  fullyParallel: false,
  workers: 1,
  // Generous per-test cap: visual specs wait for the legacy RAWG-enrichment
  // loop to exhaust its 150-game queue before screenshotting (~30s on webkit).
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Lock the timezone so any date-of-render values in screenshots stay
    // stable. Animation disabling happens at the screenshot level via
    // `animations: 'disabled'` in toHaveScreenshot opts.
    timezoneId: 'America/Los_Angeles',
  },
  expect: {
    // Stricter pixel diff than the default 0.2; covers the visual-regression
    // discipline outlined in docs/ARCHITECTURE.md.
    toHaveScreenshot: { maxDiffPixelRatio: 0.005 },
  },
  webServer: {
    command: 'pnpm preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'webkit-iphone',
      use: { ...devices['iPhone 14 Pro'] },
    },
  ],
});
