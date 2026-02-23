/**
 * E2E tests for Platform template export page.
 *
 * Selectors are based on the actual Export page UI:
 * - Header: "Export {name}" (h1), e.g. "Export Saramin Resume"
 * - Description: "Choose your preferred format to export your resume"
 * - Back button: ghost icon button with ArrowLeft (navigates to /platforms)
 * - Two-column layout: Export Options (left) + Preview (right)
 * - Export Options card:
 *   - CardTitle: "Export Options" (with Download icon)
 *   - CardDescription: "Select the file format to export"
 *   - RadioGroup with 3 format options:
 *     - "HTML" with description
 *     - "Markdown" with description
 *     - "Word (DOCX)" with description
 *   - Export button (full width): "Download {FORMAT}" (e.g. "Download HTML")
 *   - Disabled if no analyzed data, shows alert: "No Analyzed Projects"
 * - Preview card:
 *   - CardTitle: "Preview" (with Eye icon)
 *   - CardDescription: "Preview with your data applied"
 *   - iframe (title="Resume Preview") or empty state "Preview not available"
 * - Template info section at bottom of export options: template name, platform badge
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

test.describe('Platform Export Page Structure', () => {
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

  test('should display export page heading', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/export`)
    await page.waitForLoadState('domcontentloaded')

    // Heading is "Export {template_name}" (h1)
    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toBeVisible({ timeout: 5000 })
    // Should contain "Export"
    await expect(heading).toContainText('Export')
  })

  test('should show export description', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/export`)
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByText('Choose your preferred format to export your resume')
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show Export Options card', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/export`)
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByText('Export Options')).toBeVisible({ timeout: 5000 })
    await expect(
      page.getByText('Select the file format to export')
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show format radio options', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/export`)
    await page.waitForLoadState('domcontentloaded')

    // Three format options as radio items
    await expect(page.getByLabel('HTML')).toBeVisible({ timeout: 5000 })
    await expect(page.getByLabel('Markdown')).toBeVisible({ timeout: 5000 })
    await expect(page.getByLabel('Word (DOCX)')).toBeVisible({ timeout: 5000 })
  })

  test('should show export button with Download text', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/export`)
    await page.waitForLoadState('domcontentloaded')

    // Default format is HTML, so button should say "Download HTML"
    const exportBtn = page.getByRole('button', { name: /Download/ })
    await expect(exportBtn).toBeVisible({ timeout: 5000 })
  })

  test('should show Preview card', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/export`)
    await page.waitForLoadState('domcontentloaded')

    // Preview card title
    await expect(page.getByText('Preview')).toBeVisible({ timeout: 5000 })
    await expect(
      page.getByText('Preview with your data applied')
    ).toBeVisible({ timeout: 5000 })
  })

  test('should change format selection', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/export`)
    await page.waitForLoadState('domcontentloaded')

    // Click on Markdown format option
    await page.getByLabel('Markdown').click()

    // Export button should update to show "Download MD"
    await expect(
      page.getByRole('button', { name: 'Download MD' })
    ).toBeVisible({ timeout: 5000 })

    // Click on Word format option
    await page.getByLabel('Word (DOCX)').click()

    // Export button should update to show "Download DOCX"
    await expect(
      page.getByRole('button', { name: 'Download DOCX' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show template info section', async ({ page }) => {
    if (!platformId) {
      test.skip()
      return
    }

    await page.goto(`/platforms/${platformId}/export`)
    await page.waitForLoadState('domcontentloaded')

    // Template info shows "Template:" label and "Platform:" label
    await expect(page.getByText('Template:')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Platform:')).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Platform Export Navigation', () => {
  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      await initPlatformTemplates(request)
    } finally {
      await request.dispose()
    }
  })

  test('should navigate to export from platforms list', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('domcontentloaded')

    // Click first Export button (may be disabled if no analyzed data, but still clickable via navigation)
    // First try to find an enabled export button
    const exportBtns = page.getByRole('button', { name: 'Export' })
    await expect(exportBtns.first()).toBeVisible({ timeout: 5000 })

    // Even if disabled, clicking may work for navigation (some implementations wrap in link)
    // The actual button triggers navigate() so it works even when disabled for data check
    // But the Export button IS disabled when no analyzed data - so we use Preview -> Export flow
    const previewBtn = page.getByRole('button', { name: 'Preview' }).first()
    await previewBtn.click()
    await expect(page).toHaveURL(/\/platforms\/\d+\/preview/, { timeout: 5000 })

    // From preview, click Export button
    await page.getByRole('button', { name: 'Export' }).click()
    await expect(page).toHaveURL(/\/platforms\/\d+\/export/, { timeout: 5000 })
  })
})
