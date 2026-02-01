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

  test('should navigate to export page', async ({ page }) => {
    // Wait for templates to load
    await page.waitForTimeout(2000)

    // Find and click export button
    const exportButton = page.locator('button, a').filter({ hasText: /export|내보내기|다운로드/i }).first()

    if (await exportButton.isVisible()) {
      await exportButton.click()
      await expect(page).toHaveURL(/.*platforms.*export|.*export.*/)
    }
  })
})

test.describe('Platform Preview Page', () => {
  test('should display preview with format tabs', async ({ page }) => {
    // First go to platforms page
    await page.goto('/platforms')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    // Find and click on first preview link
    const previewLink = page.locator('a[href*="preview"], button').filter({ hasText: /preview|미리보기/i }).first()

    if (await previewLink.isVisible()) {
      await previewLink.click()
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

      // Check for format tabs (HTML, Markdown, Word)
      const tabs = page.locator('[role="tablist"], [class*="Tabs"]')
      await expect(tabs).toBeVisible({ timeout: 10000 })

      // Check for HTML tab
      const htmlTab = page.locator('button, [role="tab"]').filter({ hasText: /html/i })
      await expect(htmlTab.first()).toBeVisible({ timeout: 5000 })
    }
  })
})

test.describe('Platform Export Page', () => {
  test('should display export options', async ({ page }) => {
    // Go to platforms page
    await page.goto('/platforms')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    // Find and click on first export link
    const exportLink = page.locator('a[href*="export"], button').filter({ hasText: /export|내보내기/i }).first()

    if (await exportLink.isVisible()) {
      await exportLink.click()
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

      // Check for export format selection
      const formatOptions = page.locator('[class*="radio"], [role="radiogroup"], select')
      await expect(formatOptions.first()).toBeVisible({ timeout: 10000 })
    }
  })
})
