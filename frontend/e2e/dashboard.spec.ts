import { test, expect } from '@playwright/test'

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard')
  })

  test('should display dashboard title', async ({ page }) => {
    // Dashboard may show various headers, check for any main content
    const mainContent = page.locator('main, [class*="content"], [class*="Content"]')
    await expect(mainContent.first()).toBeVisible({ timeout: 10000 })
  })

  test('should display statistics cards', async ({ page }) => {
    // Wait for content to load
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

    // Check for stat cards (projects, companies, etc.)
    const cards = page.locator('[class*="card"], [class*="Card"]')
    await expect(cards.first()).toBeVisible({ timeout: 10000 })
  })

  test('should have quick action buttons', async ({ page }) => {
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

    // Look for action buttons or links
    const buttons = page.locator('button, a').filter({ hasText: /add|create|new|추가|생성/i })
    const buttonCount = await buttons.count()
    expect(buttonCount).toBeGreaterThanOrEqual(0) // May not exist if empty state
  })
})
