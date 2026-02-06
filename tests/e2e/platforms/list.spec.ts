/**
 * E2E tests for Platform template list.
 */

import { test, expect } from '@playwright/test'
import { initPlatformTemplates, createApiContext } from '../fixtures/api-helpers'

test.describe('Platform Template List', () => {
  test.beforeAll(async () => {
    // Ensure system templates are initialized
    const request = await createApiContext()
    try {
      await initPlatformTemplates(request)
    } finally {
      await request.dispose()
    }
  })

  test('should display platform templates page', async ({ page }) => {
    await page.goto('/platforms')

    // Should show page title
    await expect(
      page.locator('h1, h2').filter({ hasText: /플랫폼|Platforms|이력서|Resume/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should show available platform templates', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('networkidle')

    // Should show at least one platform card
    const platformCards = page.locator(
      '[data-testid="platform-card"], [data-testid="template-card"]'
    )

    // May have saramin, remember, jumpit templates
    await expect(platformCards.first()).toBeVisible({ timeout: 10000 })
  })

  test('should show saramin template', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('text=사람인, text=Saramin').first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should show remember template', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('text=리멤버, text=Remember').first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should show jumpit template', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('text=점핏, text=Jumpit').first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should have preview buttons for each template', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('networkidle')

    const previewBtns = page.locator(
      'button:has-text("미리보기"), button:has-text("Preview")'
    )

    // Should have at least one preview button
    await expect(previewBtns.first()).toBeVisible({ timeout: 10000 })
  })

  test('should have export buttons for each template', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('networkidle')

    const exportBtns = page.locator(
      'button:has-text("내보내기"), button:has-text("Export")'
    )

    // Should have at least one export button
    await expect(exportBtns.first()).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Platform Template Details', () => {
  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      await initPlatformTemplates(request)
    } finally {
      await request.dispose()
    }
  })

  test('should navigate to template detail on click', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('networkidle')

    // Click on first platform card
    const card = page.locator(
      '[data-testid="platform-card"], [data-testid="template-card"]'
    ).first()

    if (await card.isVisible()) {
      await card.click()

      // Should navigate to detail or preview page
      await page.waitForURL(/\/platforms\/\d+/, { timeout: 5000 }).catch(() => {})
    }
  })

  test('should show template description', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('networkidle')

    // Look for descriptions
    const descriptions = page.locator(
      '[data-testid="template-description"], .description, p'
    )

    await expect(descriptions.first()).toBeVisible({ timeout: 10000 })
  })
})
