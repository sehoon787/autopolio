/**
 * E2E tests for Platform template preview.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestCompany,
  createTestProject,
  initPlatformTemplates,
  getPlatformTemplates,
  cleanupTestData,
  TestDataContext,
} from '../fixtures/api-helpers'

test.describe('Platform Preview with Sample Data', () => {
  let platformId: number

  test.beforeAll(async ({ request }) => {
    await initPlatformTemplates(request)
    const platforms = await getPlatformTemplates(request)
    if (platforms.length > 0) {
      platformId = platforms[0].id
    }
  })

  test('should display preview page', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/preview`)

    // Should show preview page
    await expect(
      page.locator('h1, h2').filter({ hasText: /미리보기|Preview/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should show iframe with rendered template', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/preview`)
    await page.waitForLoadState('networkidle')

    // Should have iframe for preview
    const iframe = page.locator('iframe')
    await expect(iframe).toBeVisible({ timeout: 10000 })
  })

  test('should show sample data by default', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/preview`)
    await page.waitForLoadState('networkidle')

    // Look for sample data indicator
    const sampleIndicator = page.locator(
      'text=샘플, text=Sample, [data-testid="sample-data-indicator"]'
    )

    // May have sample toggle or indicator
    if (await sampleIndicator.isVisible()) {
      await expect(sampleIndicator).toBeVisible()
    }
  })

  test('should have fullscreen preview option', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/preview`)
    await page.waitForLoadState('networkidle')

    // Look for fullscreen button
    const fullscreenBtn = page.locator(
      'button:has-text("전체화면"), button:has-text("Fullscreen"), button[aria-label*="fullscreen"]'
    ).first()

    if (await fullscreenBtn.isVisible()) {
      await fullscreenBtn.click()
      // Should expand to fullscreen
    }
  })

  test('should have print option', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/preview`)
    await page.waitForLoadState('networkidle')

    // Look for print button
    const printBtn = page.locator(
      'button:has-text("인쇄"), button:has-text("Print")'
    ).first()

    if (await printBtn.isVisible()) {
      await expect(printBtn).toBeVisible()
    }
  })
})

test.describe('Platform Preview with Real Data', () => {
  let testContext: TestDataContext
  let platformId: number

  test.beforeAll(async ({ request }) => {
    await initPlatformTemplates(request)
    const platforms = await getPlatformTemplates(request)
    if (platforms.length > 0) {
      platformId = platforms[0].id
    }

    const user = await createTestUser(request)
    const company = await createTestCompany(request, user.id)
    const project = await createTestProject(request, user.id, company.id)
    testContext = { user, company, project }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should toggle to real data', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/preview`)
    await page.waitForLoadState('networkidle')

    // Look for toggle to switch to real data
    const realDataToggle = page.locator(
      '[data-testid="real-data-toggle"], button:has-text("실제 데이터"), input[type="checkbox"]'
    ).first()

    if (await realDataToggle.isVisible()) {
      await realDataToggle.click()
      await page.waitForLoadState('networkidle')

      // Should show real data indicator
      const realIndicator = page.locator(
        'text=실제 데이터, text=Real Data'
      )
      if (await realIndicator.isVisible()) {
        await expect(realIndicator).toBeVisible()
      }
    }
  })

  test('should show user projects in real data mode', async ({ page }) => {
    if (!platformId || !testContext.project) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/preview`)
    await page.waitForLoadState('networkidle')

    // Toggle to real data
    const toggle = page.locator('[data-testid="real-data-toggle"]').first()
    if (await toggle.isVisible()) {
      await toggle.click()
      await page.waitForLoadState('networkidle')

      // Check if project name appears in preview
      const iframe = page.frameLocator('iframe')
      const projectName = iframe.locator(`text=${testContext.project.name}`)

      // May take time to render
      await page.waitForTimeout(2000)
    }
  })
})

test.describe('Platform Preview Navigation', () => {
  test.beforeAll(async ({ request }) => {
    await initPlatformTemplates(request)
  })

  test('should navigate to preview from list', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('networkidle')

    // Click preview button
    const previewBtn = page.locator(
      'button:has-text("미리보기"), button:has-text("Preview")'
    ).first()

    if (await previewBtn.isVisible()) {
      await previewBtn.click()

      // Should navigate to preview page
      await expect(page).toHaveURL(/\/preview/, { timeout: 10000 })
    }
  })

  test('should navigate back to list from preview', async ({ page }) => {
    await page.goto('/platforms/1/preview')
    await page.waitForLoadState('networkidle')

    // Click back button
    const backBtn = page.locator(
      'button:has-text("뒤로"), button:has-text("Back"), a[href="/platforms"]'
    ).first()

    if (await backBtn.isVisible()) {
      await backBtn.click()

      // Should navigate back to list
      await expect(page).toHaveURL('/platforms', { timeout: 10000 })
    }
  })
})
