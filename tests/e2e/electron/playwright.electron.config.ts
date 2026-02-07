/**
 * Playwright configuration for Electron E2E tests.
 *
 * Usage:
 *   cd tests/e2e
 *   npx playwright test --config=electron/playwright.electron.config.ts
 */

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  fullyParallel: false, // Electron tests share one app instance
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1, // Single worker — one Electron app at a time
  reporter: [
    ['html', { outputFolder: 'playwright-report-electron' }],
    ['list'],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  outputDir: 'test-results-electron/',
  timeout: 240_000, // 4 minutes per test (analysis can be slow)
  expect: {
    timeout: 15_000,
  },
})
