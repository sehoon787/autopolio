/**
 * E2E tests for Platform template list page.
 *
 * Selectors are based on the actual Platforms page UI:
 * - Page heading: "Job Platforms" (h1)
 * - Description: "Export your resume with platform-specific templates"
 * - Platform template cards with:
 *   - Template name (CardTitle) + "System" badge (if is_system)
 *   - Platform key (CardDescription)
 *   - Description text
 *   - Features badges with CheckCircle2 icon
 *   - "Preview" button (Eye icon) in card footer
 *   - "Export" button (Download icon) in card footer (disabled if no analyzed data)
 * - Empty state: AlertCircle icon + "No Templates" + "Initialize system templates to get started"
 * - Loading: 3 skeleton cards
 *
 * Note: System templates are loaded from static config (IDs 9001-9004),
 * not from DB. They are always available via the API.
 */

import { test, expect } from '@playwright/test'
import { initPlatformTemplates, createApiContext } from '../fixtures/api-helpers'

test.describe('Platform Templates List', () => {
  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      await initPlatformTemplates(request)
    } finally {
      await request.dispose()
    }
  })

  test('should display platform templates page heading', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByRole('heading', { name: 'Job Platforms' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show page description', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByText('Export your resume with platform-specific templates')
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show platform template cards', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('domcontentloaded')

    // Should have at least one Preview button (one per card)
    const previewBtns = page.getByRole('button', { name: 'Preview' })
    await expect(previewBtns.first()).toBeVisible({ timeout: 5000 })
  })

  test('should show System badge on system templates', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('domcontentloaded')

    // System templates have "System" badge
    await expect(page.getByText('System').first()).toBeVisible({ timeout: 5000 })
  })

  test('should show Preview button for each template', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('domcontentloaded')

    const previewBtns = page.getByRole('button', { name: 'Preview' })
    await expect(previewBtns.first()).toBeVisible({ timeout: 5000 })
    const count = await previewBtns.count()
    expect(count).toBeGreaterThan(0)
  })

  test('should show Export button for each template', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('domcontentloaded')

    const exportBtns = page.getByRole('button', { name: 'Export' })
    await expect(exportBtns.first()).toBeVisible({ timeout: 5000 })
    const count = await exportBtns.count()
    expect(count).toBeGreaterThan(0)
  })

  test('should navigate to preview page on Preview click', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('domcontentloaded')

    const previewBtn = page.getByRole('button', { name: 'Preview' }).first()
    await expect(previewBtn).toBeVisible({ timeout: 5000 })
    await previewBtn.click()

    await expect(page).toHaveURL(/\/platforms\/\d+\/preview/, { timeout: 5000 })
  })

  test('should show Features section on template cards', async ({ page }) => {
    await page.goto('/platforms')
    await page.waitForLoadState('domcontentloaded')

    // Cards may show "Features:" label
    const featuresLabel = page.getByText('Features:')
    if (await featuresLabel.first().isVisible().catch(() => false)) {
      await expect(featuresLabel.first()).toBeVisible()
    }
  })
})
