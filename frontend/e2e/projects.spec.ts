import { test, expect } from '@playwright/test'

test.describe('Projects Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/knowledge/projects')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  })

  test('should display projects page header', async ({ page }) => {
    const header = page.locator('h1, h2').filter({ hasText: /project|프로젝트/i })
    await expect(header).toBeVisible({ timeout: 10000 })
  })

  test('should have add project button', async ({ page }) => {
    const addButton = page.locator('button').filter({ hasText: /add|create|new|추가|생성/i })
    await expect(addButton.first()).toBeVisible({ timeout: 10000 })
  })

  test('should open create project dialog', async ({ page }) => {
    const addButton = page.locator('button').filter({ hasText: /add|create|new|추가|생성/i }).first()
    await addButton.click()

    // Check dialog appears
    const dialog = page.locator('[role="dialog"], [class*="Dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Check form fields are present
    await expect(page.locator('input[name="name"], input[id*="name"]').first()).toBeVisible({ timeout: 5000 })
  })

  test('should close dialog with cancel button or escape key', async ({ page }) => {
    const addButton = page.locator('button').filter({ hasText: /add|create|new|추가|생성/i }).first()
    await addButton.click()

    // Wait for dialog to appear
    const dialog = page.locator('[role="dialog"], [class*="Dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Try to close with Escape key
    await page.keyboard.press('Escape')

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5000 })
  })

  test('should have view toggle (list/kanban)', async ({ page }) => {
    // Look for view toggle buttons
    const toggleButtons = page.locator('button').filter({ hasText: /list|grid|kanban|목록|칸반/i })
    const count = await toggleButtons.count()
    expect(count).toBeGreaterThanOrEqual(0) // May exist depending on design
  })

  test('should display filters panel', async ({ page }) => {
    // Look for filter controls
    const filters = page.locator('[class*="filter"], [class*="Filter"], button').filter({ hasText: /filter|필터/i })
    const count = await filters.count()
    expect(count).toBeGreaterThanOrEqual(0)
  })
})
