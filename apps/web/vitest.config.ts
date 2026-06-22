import { defineConfig } from 'vitest/config';

// Vitest discovers tests under src/ and tests/unit; the Playwright suites
// under tests/e2e use a different runner and would fail to parse here.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}'],
  },
});
