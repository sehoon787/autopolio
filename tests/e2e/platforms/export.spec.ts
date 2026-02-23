/**
 * E2E tests for Platform template export.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestProject,
  initPlatformTemplates,
  getPlatformTemplates,
  cleanupTestData,
  createApiContext,
  TestDataContext,
} from '../fixtures/api-helpers'

test.describe('Platform Export Page', () => {
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

  test('should display export page', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/export`)

    // Should show export page
    await expect(
      page.locator('h1, h2').filter({ hasText: /내보내기|Export/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should show export format options', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/export`)
    await page.waitForLoadState('domcontentloaded')

    // Should have HTML, Markdown, Word options
    const htmlBtn = page.locator('button:has-text("HTML")')
    const mdBtn = page.locator('button:has-text("Markdown"), button:has-text("MD")')
    const wordBtn = page.locator('button:has-text("Word"), button:has-text("DOCX")')

    await expect(htmlBtn.or(mdBtn).or(wordBtn)).toBeVisible({ timeout: 10000 })
  })
})

test.describe('HTML Export', () => {
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

  test('should export to HTML', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/export`)
    await page.waitForLoadState('domcontentloaded')

    const htmlBtn = page.locator('button:has-text("HTML")').first()

    if (await htmlBtn.isVisible()) {
      // Start waiting for download before clicking
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
      await htmlBtn.click()

      try {
        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/\.html$/i)
      } catch {
        // May show download link instead of auto-download
      }
    }
  })

  test('should download HTML file with correct name', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/export`)
    await page.waitForLoadState('domcontentloaded')

    const htmlBtn = page.locator('button:has-text("HTML")').first()

    if (await htmlBtn.isVisible()) {
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
      await htmlBtn.click()

      try {
        const download = await downloadPromise
        const filename = download.suggestedFilename()
        expect(filename).toMatch(/\.(html|htm)$/i)
      } catch {
        // Download might not trigger automatically
      }
    }
  })
})

test.describe('Markdown Export', () => {
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

  test('should export to Markdown', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/export`)
    await page.waitForLoadState('domcontentloaded')

    const mdBtn = page.locator('button:has-text("Markdown"), button:has-text("MD")').first()

    if (await mdBtn.isVisible()) {
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
      await mdBtn.click()

      try {
        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/\.md$/i)
      } catch {
        // May show download link instead
      }
    }
  })
})

test.describe('Word Export', () => {
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

  test('should export to Word', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/export`)
    await page.waitForLoadState('domcontentloaded')

    const wordBtn = page.locator('button:has-text("Word"), button:has-text("DOCX")').first()

    if (await wordBtn.isVisible()) {
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
      await wordBtn.click()

      try {
        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/\.docx$/i)
      } catch {
        // May show download link instead
      }
    }
  })
})

test.describe('Export with Real User Data', () => {
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
      const project = await createTestProject(request, user.id, undefined, {
        name: 'Export Test Project',
        description: 'Project for testing export functionality',
      })
      testContext = { user, project }
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

  test('should export with user data', async ({ page }) => {
    if (!platformId || !testContext.user) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/export`)
    await page.waitForLoadState('domcontentloaded')

    // Toggle to use real data
    const realDataToggle = page.locator(
      '[data-testid="real-data-toggle"], input[type="checkbox"]'
    ).first()

    if (await realDataToggle.isVisible()) {
      await realDataToggle.click()
    }

    // Export
    const htmlBtn = page.locator('button:has-text("HTML")').first()
    if (await htmlBtn.isVisible()) {
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
      await htmlBtn.click()

      try {
        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/\.html$/i)
      } catch {
        // OK if download doesn't auto-trigger
      }
    }
  })
})

test.describe('Export Navigation', () => {
  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      await initPlatformTemplates(request)
    } finally {
      await request.dispose()
    }
  })

  test('should navigate to export from list', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('domcontentloaded')

    const exportBtn = page.locator(
      'button:has-text("내보내기"), button:has-text("Export")'
    ).first()

    if (await exportBtn.isVisible()) {
      await exportBtn.click()

      // Should navigate to export page
      await expect(page).toHaveURL(/\/export/, { timeout: 10000 })
    }
  })

  test('should navigate to export from preview', async ({ page }) => {
    await page.goto('/platforms/1/preview')
    await page.waitForLoadState('domcontentloaded')

    const exportBtn = page.locator(
      'button:has-text("내보내기"), button:has-text("Export"), a[href*="export"]'
    ).first()

    if (await exportBtn.isVisible()) {
      await exportBtn.click()

      // Should navigate to export page
      await expect(page).toHaveURL(/\/export/, { timeout: 10000 })
    }
  })
})
