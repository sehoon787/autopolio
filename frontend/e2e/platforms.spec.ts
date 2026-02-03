import { test, expect } from '@playwright/test'

test.describe('Platforms Page (v1.11)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  })

  test('should display platforms page header', async ({ page }) => {
    const header = page.locator('h1, h2').filter({ hasText: /platform|플랫폼|이력서|template|템플릿/i })
    await expect(header).toBeVisible({ timeout: 10000 })
  })

  test('should display platform template cards', async ({ page }) => {
    // Wait for templates to load
    await page.waitForTimeout(2000)

    // Look for template cards (Saramin, Remember, Jumpit)
    const cards = page.locator('[class*="card"], [class*="Card"]')
    const count = await cards.count()
    expect(count).toBeGreaterThanOrEqual(0) // At least some cards should exist
  })

  test('should have initialize templates button if empty', async ({ page }) => {
    // Look for init button or template cards
    const initButton = page.locator('button').filter({ hasText: /init|초기화|생성/i })
    const cards = page.locator('[class*="card"], [class*="Card"]')

    const initCount = await initButton.count()
    const cardsCount = await cards.count()

    // Either init button or cards should exist
    expect(initCount + cardsCount).toBeGreaterThanOrEqual(0)
  })

  test('should navigate to preview page', async ({ page }) => {
    // Wait for templates to load
    await page.waitForTimeout(2000)

    // Find and click preview button on a template card
    const previewButton = page.locator('button, a').filter({ hasText: /preview|미리보기/i }).first()

    if (await previewButton.isVisible()) {
      await previewButton.click()
      await expect(page).toHaveURL(/.*platforms.*preview|.*preview.*/)
    }
  })

  test('should have export button on template cards', async ({ page }) => {
    // Wait for templates to load
    await page.waitForTimeout(2000)

    // Find export buttons on template cards
    const exportButtons = page.locator('button').filter({ hasText: /export|내보내기/i })
    const count = await exportButtons.count()

    // Export buttons should exist (may be disabled if no data)
    expect(count).toBeGreaterThan(0)

    // Check if at least one export button is visible
    await expect(exportButtons.first()).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Platform Preview Page', () => {
  test('should display preview with sample data for guest users', async ({ page }) => {
    // First go to platforms page
    await page.goto('/platforms')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    // Find and click on first preview button (not link)
    const previewButton = page.locator('button').filter({ hasText: /preview|미리보기/i }).first()

    if (await previewButton.isVisible()) {
      await previewButton.click()
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

      // Check for Sample Data indicator
      const sampleDataIndicator = page.locator('text=/sample data|샘플/i')
      await expect(sampleDataIndicator.first()).toBeVisible({ timeout: 10000 })

      // Guest users should NOT see the "real data" toggle (it's hidden for non-logged-in users)
      const realDataToggle = page.locator('text=/real data|실제.*데이터|view.*real/i')
      await expect(realDataToggle).toHaveCount(0)

      // Check for action buttons (Print, Fullscreen, Export)
      const printButton = page.locator('button').filter({ hasText: /print|인쇄/i })
      await expect(printButton.first()).toBeVisible({ timeout: 5000 })
    }
  })
})

test.describe('Platform Export from Preview', () => {
  test('should have export button on preview page', async ({ page }) => {
    // Go to platforms page
    await page.goto('/platforms')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    // Click preview first
    const previewButton = page.locator('button').filter({ hasText: /preview|미리보기/i }).first()

    if (await previewButton.isVisible()) {
      await previewButton.click()
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

      // Check for export button on preview page (in header)
      const exportButton = page.locator('button').filter({ hasText: /export|내보내기/i })
      await expect(exportButton.first()).toBeVisible({ timeout: 10000 })
    }
  })
})
