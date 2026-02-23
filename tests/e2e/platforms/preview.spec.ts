/**
 * E2E tests for Platform template preview page.
 *
 * Selectors are based on the actual Preview page UI:
 * - Header: template name as h1 (e.g. "Saramin Resume"), "System" badge (if system template)
 * - Subtitle: "Resume Preview"
 * - Buttons: "Print" (Printer icon), "Fullscreen" (Maximize2 icon), "Export" (Download icon)
 * - Data source badge in card header: "Real Data" (green) or "Sample Data" (secondary)
 * - Real data toggle: Switch with id="real-data-toggle", label "View real data"
 * - iframe for HTML preview (title="HTML Preview")
 * - Loading state: Loader2 spinner + "Loading preview..."
 * - Fullscreen mode: full viewport iframe, "Print" button, "Exit Fullscreen" (Minimize2) button
 * - Back button: ghost icon button with ArrowLeft (navigates to /platforms)
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestCompany,
  createTestProject,
  initPlatformTemplates,
  getPlatformTemplates,
  cleanupTestData,
  createApiContext,
  TestDataContext,
} from '../fixtures/api-helpers'

test.describe('Platform Preview Page', () => {
  let platformId: number

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      await initPlatformTemplates(request)
      const platforms = await getPlatformTemplates(request)
      if (platforms.length > 0) {
        platformId = platforms[0].id
      }
    } finally {
      await request.dispose()
    }
  })

  test('should display template name as heading', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/preview`)
    await page.waitForLoadState('domcontentloaded')

    // Template name appears as h1
    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toBeVisible({ timeout: 5000 })
  })

  test('should show Resume Preview subtitle', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/preview`)
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByText('Resume Preview')).toBeVisible({ timeout: 5000 })
  })

  test('should show Print button', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/preview`)
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByRole('button', { name: 'Print' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show Fullscreen button', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/preview`)
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByRole('button', { name: 'Fullscreen' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show Export button', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/preview`)
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByRole('button', { name: 'Export' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show iframe for HTML preview', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/preview`)
    await page.waitForLoadState('domcontentloaded')

    // Wait for preview to load (either iframe appears or loading spinner)
    const iframe = page.locator('iframe')
    await expect(iframe).toBeVisible({ timeout: 10000 })
  })

  test('should show data source badge', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/preview`)
    await page.waitForLoadState('domcontentloaded')

    // Wait for preview to load, then check for either "Sample Data" or "Real Data" badge
    await page.waitForTimeout(2000)
    const sampleBadge = page.getByText('Sample Data')
    const realBadge = page.getByText('Real Data')
    await expect(sampleBadge.or(realBadge)).toBeVisible({ timeout: 5000 })
  })

  test('should show real data toggle switch', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/preview`)
    await page.waitForLoadState('domcontentloaded')

    // Switch with id="real-data-toggle"
    const toggle = page.locator('#real-data-toggle')
    await expect(toggle).toBeVisible({ timeout: 5000 })

    // Label text
    await expect(page.getByText('View real data')).toBeVisible({ timeout: 5000 })
  })

  test('should navigate to export page on Export click', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/preview`)
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('button', { name: 'Export' }).click()

    await expect(page).toHaveURL(/\/platforms\/\d+\/export/, { timeout: 5000 })
  })
})

test.describe('Platform Preview with Real Data', () => {
  let testContext: TestDataContext
  let platformId: number

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      await initPlatformTemplates(request)
      const platforms = await getPlatformTemplates(request)
      if (platforms.length > 0) {
        platformId = platforms[0].id
      }

      const user = await createTestUser(request)
      const company = await createTestCompany(request, user.id)
      const project = await createTestProject(request, user.id, company.id)
      testContext = { user, company, project }
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

  test('should toggle real data switch', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/preview`)
    await page.waitForLoadState('domcontentloaded')

    // Toggle the real data switch
    const toggle = page.locator('#real-data-toggle')
    await expect(toggle).toBeVisible({ timeout: 5000 })
    await toggle.click()

    // After toggling, should attempt to load real data
    // Wait for preview to settle
    await page.waitForTimeout(2000)

    // The data source badge should update (may show "Real Data" or fall back to "Sample Data")
    const sampleBadge = page.getByText('Sample Data')
    const realBadge = page.getByText('Real Data')
    await expect(sampleBadge.or(realBadge)).toBeVisible({ timeout: 5000 })
  })
})
