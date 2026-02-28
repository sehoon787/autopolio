import { defineConfig, devices } from '@playwright/test'
import { FRONTEND_URL } from './runtimeConfig'

/**
 * Playwright configuration for E2E tests.
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: '.',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  /* No retries on CI — fail fast to stay within timeout */
  retries: 0,
  /* Run 4 parallel workers on CI for faster execution */
  workers: process.env.CI ? 4 : undefined,
  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: FRONTEND_URL,

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video — disabled on CI to save resources */
    video: process.env.CI ? 'off' : 'on-first-retry',

    /* Action timeout — fail fast on mismatched selectors */
    actionTimeout: 5000,

    /* Navigation timeout */
    navigationTimeout: 10000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Skip Electron-specific tests in CI (no Electron runtime available) */
  testIgnore: process.env.CI ? ['**/electron/**'] : [],

  /* Folder for test artifacts such as screenshots, videos, traces, etc. */
  outputDir: 'test-results/',

  /* Timeout settings */
  timeout: 30000, // 30 seconds per test
  expect: {
    timeout: 10000, // 10 seconds for assertions (Docker parallel execution)
  },
})
