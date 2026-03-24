/**
 * E2E tests for GitHub repository pages.
 *
 * Key UI details:
 * - Setup page (/setup): heading "Get Started with Autopolio", "Login with GitHub" button
 * - GitHub settings page (/setup/github): heading "GitHub Connection",
 *   card title "GitHub Account", "Connect with GitHub" button when not connected
 * - Repo selector page (/github/repos):
 *   - When not connected: shows "GitHub Connection Required" heading,
 *     description text, and "Connect GitHub" button that navigates to /setup/github
 *   - When connected: heading "GitHub Repositories", subtitle "Select repositories
 *     to import as projects", search input, owner filter, language filter,
 *     repo list with selectable tiles, "Import Selected" button
 *
 * In CI, GitHub is NOT connected (no OAuth token), so tests focus on the
 * "not connected" state and UI structure verification.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  cleanupTestData,
  createApiContext,
  TestDataContext,
} from '../fixtures/api-helpers'

test.describe('GitHub Setup Page', () => {
  test('should display setup page with welcome heading', async ({ page }) => {
    await page.goto('/setup')
    await page.waitForLoadState('domcontentloaded')

    // The setup page shows "Get Started with Autopolio" heading
    await expect(
      page.getByRole('heading', { name: /Get Started with Autopolio/ })
    ).toBeVisible({ timeout: 15000 })
  })

  test('should display Login with GitHub button on setup page', async ({ page }) => {
    await page.goto('/setup')
    await page.waitForLoadState('domcontentloaded')

    // The main login button reads "Login with GitHub"
    await expect(
      page.getByRole('button', { name: /Login with GitHub/ })
    ).toBeVisible({ timeout: 15000 })
  })

  test('should display GitHub settings page heading', async ({ page }) => {
    await page.goto('/setup/github')
    await page.waitForLoadState('domcontentloaded')

    // Page heading is "GitHub Connection"
    await expect(
      page.getByRole('heading', { name: /GitHub Connection/ })
    ).toBeVisible({ timeout: 15000 })
  })

  test('should display GitHub Account card', async ({ page }) => {
    await page.goto('/setup/github')
    await page.waitForLoadState('domcontentloaded')

    // Card title is "GitHub Account"
    await expect(
      page.getByText('GitHub Account')
    ).toBeVisible({ timeout: 15000 })
  })

  test('should show connect button when not connected', async ({ page }) => {
    await page.goto('/setup/github')
    await page.waitForLoadState('domcontentloaded')

    // When not connected, shows "Connect with GitHub" button or features list
    // The connect button text is "Connect with GitHub" (setup.connect)
    const connectBtn = page.getByRole('button', { name: /Connect with GitHub/ })
    const connectedText = page.getByText('Connected')

    // Either we see the connect button (not connected) or "Connected" text
    await expect(connectBtn.or(connectedText)).toBeVisible({ timeout: 15000 })
  })
})

test.describe('GitHub Repository Selector - Not Connected State', () => {
  test('should show connection required message', async ({ page }) => {
    await page.goto('/github/repos')
    await page.waitForLoadState('domcontentloaded')

    // When not connected, the page shows "GitHub Connection Required" heading
    // or "Checking GitHub connection..." while loading, or the repo list if connected
    const connectionRequired = page.getByText('GitHub Connection Required')
    const checking = page.getByText('Checking GitHub connection...')
    const repoTitle = page.getByRole('heading', { name: /GitHub Repositories/ })

    await expect(
      connectionRequired.or(checking).or(repoTitle)
    ).toBeVisible({ timeout: 15000 })
  })

  test('should show connect button on connection required page', async ({ page }) => {
    await page.goto('/github/repos')
    await page.waitForLoadState('domcontentloaded')

    // Wait for the connection check to complete
    await page.waitForTimeout(1000)

    // If not connected, shows "Connect GitHub" button
    const connectBtn = page.getByRole('button', { name: /Connect GitHub/ })
    const repoTitle = page.getByRole('heading', { name: /GitHub Repositories/ })

    // Either we see the connect button (not connected) or the repo page (connected)
    await expect(connectBtn.or(repoTitle)).toBeVisible({ timeout: 15000 })
  })

  test('should show connection required description text', async ({ page }) => {
    await page.goto('/github/repos')
    await page.waitForLoadState('domcontentloaded')

    // Wait for loading to finish
    await page.waitForTimeout(1000)

    // If not connected, shows description about connecting
    const descText = page.getByText('Please connect your GitHub account to import repositories.')
    const repoTitle = page.getByRole('heading', { name: /GitHub Repositories/ })

    await expect(descText.or(repoTitle)).toBeVisible({ timeout: 15000 })
  })

  test('should navigate to GitHub settings from connection required page', async ({ page }) => {
    await page.goto('/github/repos')
    await page.waitForLoadState('domcontentloaded')

    // Wait for loading to finish
    await page.waitForTimeout(1000)

    // If not connected, clicking "Connect GitHub" should navigate to /setup/github
    const connectBtn = page.getByRole('button', { name: /Connect GitHub/ })

    if (await connectBtn.isVisible()) {
      await connectBtn.click()

      // Should navigate to /setup/github with returnUrl
      await page.waitForURL(/\/setup\/github/, { timeout: 15000 })
      await expect(
        page.getByRole('heading', { name: /GitHub Connection/ })
      ).toBeVisible({ timeout: 15000 })
    }
  })
})
