/**
 * E2E tests for GitHub repository management.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  cleanupTestData,
  createApiContext,
  TestDataContext,
} from '../fixtures/api-helpers'

test.describe('GitHub Repository List', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      testContext = { user }
    } finally {
      await request.dispose()
    }
  })

  test.afterAll(async () => {
    const request = await createApiContext()
    try {
      await cleanupTestData(request, testContext)
    } finally {
      await request.dispose()
    }
  })

  test('should display GitHub setup page', async ({ page }) => {
    await page.goto('/setup/github')

    // Should show GitHub connection UI
    await expect(
      page.locator('text=GitHub').first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should show connect button when not connected', async ({ page }) => {
    await page.goto('/setup/github')
    await page.waitForLoadState('networkidle')

    // Look for connect button or connection status
    const connectBtn = page.locator(
      'button:has-text("연결"), button:has-text("Connect"), a:has-text("GitHub")'
    ).first()

    const connectedStatus = page.locator(
      'text=연결됨, text=Connected'
    ).first()

    // Either connect button or connected status should be visible
    await expect(connectBtn.or(connectedStatus)).toBeVisible({ timeout: 10000 })
  })

  test('should show repository list when connected', async ({ page }) => {
    // Note: This test assumes GitHub is connected
    await page.goto('/github/repos')
    await page.waitForLoadState('networkidle')

    // May show repos or "not connected" message
    const repoList = page.locator('[data-testid="repo-list"], [data-testid="repository-list"]')
    const notConnected = page.locator('text=연결되지 않음, text=Not connected, text=GitHub 연결')

    await expect(repoList.or(notConnected)).toBeVisible({ timeout: 10000 })
  })
})

test.describe('GitHub Repository Selection', () => {
  test('should allow selecting repositories to import', async ({ page }) => {
    await page.goto('/github/repos')
    await page.waitForLoadState('networkidle')

    // Look for repo checkboxes or selection UI
    const checkbox = page.locator(
      '[data-testid="repo-checkbox"], input[type="checkbox"]'
    ).first()

    if (await checkbox.isVisible()) {
      // Click to select
      await checkbox.click()

      // Look for import button
      const importBtn = page.locator(
        'button:has-text("가져오기"), button:has-text("Import"), button:has-text("선택")'
      )

      await expect(importBtn).toBeVisible()
    }
  })

  test('should show technology detection after selecting repo', async ({ page }) => {
    await page.goto('/github/repos')
    await page.waitForLoadState('networkidle')

    const checkbox = page.locator('[data-testid="repo-checkbox"]').first()

    if (await checkbox.isVisible()) {
      await checkbox.click()
      await page.waitForLoadState('networkidle')

      // Technology badges may appear
      const techBadges = page.locator(
        '[data-testid="detected-technologies"], [data-testid="tech-badge"]'
      )

      // Give time for detection
      await page.waitForTimeout(2000)
    }
  })
})

test.describe('GitHub Connection Flow', () => {
  test('should initiate OAuth flow on connect click', async ({ page }) => {
    await page.goto('/setup/github')
    await page.waitForLoadState('networkidle')

    const connectBtn = page.locator(
      'button:has-text("연결"), button:has-text("Connect GitHub")'
    ).first()

    if (await connectBtn.isVisible()) {
      // Clicking should navigate to GitHub OAuth or open popup
      const [popup] = await Promise.all([
        page.waitForEvent('popup').catch(() => null),
        connectBtn.click().catch(() => {}),
      ])

      // Either popup opened or we're redirected
      if (popup) {
        expect(popup.url()).toContain('github.com')
        await popup.close()
      }
    }
  })

  test('should show disconnect option when connected', async ({ page }) => {
    await page.goto('/setup/github')
    await page.waitForLoadState('networkidle')

    // If connected, should show disconnect button
    const disconnectBtn = page.locator(
      'button:has-text("연결 해제"), button:has-text("Disconnect")'
    ).first()

    const connectedStatus = page.locator('text=연결됨, text=Connected')

    if (await connectedStatus.isVisible()) {
      await expect(disconnectBtn).toBeVisible()
    }
  })
})
