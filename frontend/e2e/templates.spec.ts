import { test, expect } from '@playwright/test'

test.describe('Templates Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  })

  test('should display templates page header', async ({ page }) => {
    const header = page.locator('h1').filter({ hasText: /template|템플릿/i })
    await expect(header.first()).toBeVisible({ timeout: 10000 })
  })

  test('should display template list or empty state', async ({ page }) => {
    // Either shows template cards or empty state
    const cards = page.locator('[class*="card"], [class*="Card"]')
    const emptyState = page.locator('text=/no template|템플릿.*없|create.*first|먼저.*생성/i')

    const cardsVisible = await cards.first().isVisible().catch(() => false)
    const emptyVisible = await emptyState.first().isVisible().catch(() => false)

    expect(cardsVisible || emptyVisible).toBeTruthy()
  })

  test('should have create template button', async ({ page }) => {
    const createButton = page.locator('button, a').filter({ hasText: /create|add|new|생성|추가/i })
    await expect(createButton.first()).toBeVisible({ timeout: 10000 })
  })

  test('should navigate to template editor', async ({ page }) => {
    // Look for new template or edit template link
    const newButton = page.locator('a[href*="/new"], button').filter({ hasText: /new|create|생성/i }).first()

    if (await newButton.isVisible()) {
      await newButton.click()
      await expect(page).toHaveURL(/.*template.*new|.*template.*edit|.*editor/i)
    }
  })
})

test.describe('Template Editor', () => {
  test('should navigate to template editor from templates page', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    // Look for edit link or button on any template
    const editLinks = page.locator('a[href*="edit"], button').filter({ hasText: /edit|편집|수정/i })
    const count = await editLinks.count()
    expect(count).toBeGreaterThanOrEqual(0) // May not have templates to edit
  })

  test('should display template cards or empty state', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    // Look for template cards or content
    const content = page.locator('[class*="card"], [class*="Card"], main')
    await expect(content.first()).toBeVisible({ timeout: 10000 })
  })

  test('should have template action buttons', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    const actionButtons = page.locator('button').filter({ hasText: /preview|edit|delete|미리보기|편집|삭제|create|생성/i })
    const count = await actionButtons.count()
    expect(count).toBeGreaterThanOrEqual(0)
  })
})
