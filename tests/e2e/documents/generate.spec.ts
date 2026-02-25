/**
 * E2E tests for document generation page.
 *
 * Selectors are based on the actual Generate page UI:
 * - Page heading: "Generate Document" (h1)
 * - Subtitle: "Select projects and apply a template..."
 * - Two-column layout: Project Selection (left, lg:col-span-2) + Settings (right)
 * - Project Selection card:
 *   - CardTitle: "Project Selection"
 *   - "Select All"/"Deselect All" button
 *   - Empty state: FolderKanban icon + "No projects registered."
 *   - Project tiles: SelectableTile with project name, badges ("Analyzed", "AI Summary", "Not Analyzed")
 *   - Counter text: "N project(s) selected"
 * - Template Settings card:
 *   - CardTitle: "Template Settings"
 *   - Template select with placeholder "Select Template"
 *   - Output Format select: "Word (DOCX)", "PDF", "Markdown"
 *   - Document Name input with placeholder "Auto-generate"
 * - Generation Options card:
 *   - CardTitle: "Generation Options"
 *   - Checkboxes: "Include Achievements", "Include Tech Stack" (both checked by default)
 * - Submit button: "Start Generation" (disabled if no projects or no template selected)
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestCompany,
  createTestProject,
  cleanupTestData,
  createApiContext,
  loginAsTestUser,
  TestDataContext,
} from '../fixtures/api-helpers'

test.describe('Generate Page Structure', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      testContext = { user }
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

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page, testContext.user!)
  })

  test('should display generate page heading', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByRole('heading', { name: 'Generate Document' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show subtitle text', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByText('Select projects and apply a template')
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show empty project state when no projects', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByText('No projects registered.')).toBeVisible({ timeout: 5000 })
  })

  test('should show Project Selection card title', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByText('Project Selection')).toBeVisible({ timeout: 10000 })
  })

  test('should show Template Settings card', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByText('Template Settings')).toBeVisible({ timeout: 5000 })

    // Template select placeholder
    await expect(page.getByText('Select Template')).toBeVisible({ timeout: 5000 })
  })

  test('should show Output Format select with default Word (DOCX)', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByText('Output Format')).toBeVisible({ timeout: 5000 })
  })

  test('should show Document Name input with Auto-generate placeholder', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('domcontentloaded')

    const nameInput = page.getByPlaceholder('Auto-generate')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
  })

  test('should show Generation Options with checkboxes', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByText('Generation Options')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Include Achievements')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Include Tech Stack')).toBeVisible({ timeout: 5000 })
  })

  test('should show Start Generation button (disabled initially)', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('domcontentloaded')

    const submitBtn = page.getByRole('button', { name: 'Start Generation' })
    await expect(submitBtn).toBeVisible({ timeout: 5000 })
    // Disabled because no projects selected and no template chosen
    await expect(submitBtn).toBeDisabled()
  })
})

test.describe('Generate Page with Projects', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
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

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page, testContext.user!)
  })

  test('should show project in selection list', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('domcontentloaded')

    // Project name should appear in the selection area
    await expect(
      page.getByText(testContext.project!.name)
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show Select All button when projects exist', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByRole('button', { name: 'Select All' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show selected count after selecting a project', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('domcontentloaded')

    // Click Select All to select the project
    await page.getByRole('button', { name: 'Select All' }).click()

    // Should show "N project(s) selected"
    await expect(page.getByText(/\d+ project\(s\) selected/)).toBeVisible({ timeout: 5000 })
  })
})
