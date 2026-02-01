import { test, expect } from '@playwright/test'

test.describe('Companies Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/knowledge/companies')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  })

  test('should display companies page header', async ({ page }) => {
    const header = page.locator('h1, h2').filter({ hasText: /compan|회사|경력/i })
    await expect(header).toBeVisible({ timeout: 10000 })
  })

  test('should have add company button', async ({ page }) => {
    const addButton = page.locator('button').filter({ hasText: /add|create|new|추가|생성/i })
    await expect(addButton.first()).toBeVisible({ timeout: 10000 })
  })

  test('should open create company dialog', async ({ page }) => {
    const addButton = page.locator('button').filter({ hasText: /add|create|new|추가|생성/i }).first()
    await addButton.click()

    // Check dialog appears
    const dialog = page.locator('[role="dialog"], [class*="Dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })
  })

  test('should display company list or empty state', async ({ page }) => {
    // Either shows list or empty state message
    const content = page.locator('main, [class*="content"], [class*="Content"]')
    await expect(content).toBeVisible({ timeout: 10000 })
  })
})
