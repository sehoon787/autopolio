/**
 * E2E tests for Project detail page.
 *
 * Selectors are based on the actual ProjectDetail page UI:
 * - Project name displayed as h1 heading
 * - Short description below the heading
 * - Three tabs: "Basic Info", "Analysis Summary", "Detailed Analysis"
 * - "Edit" button with Pencil icon
 * - "Export" button with FileDown icon (only if analyzed)
 * - "Analyze Repo" / "Re-analyze" button (only if git_url exists)
 * - Analysis language selector dropdown (ko/en)
 * - Status badges: "Analyzed" (green) or analysis progress
 *
 * Edit dialog:
 * - Title: "Edit Project"
 * - Form fields use "detail_edit_" prefix: id="detail_edit_name",
 *   id="detail_edit_short_description", id="detail_edit_start_date", etc.
 * - Dialog footer: Cancel + Save buttons
 *
 * Basic Info tab shows: Project Info section with Period, Company, Role,
 *   Team Size, Tech Stack, Key Tasks, Achievements, Commit Statistics
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
import { API_BASE_URL } from '../runtimeConfig'

test.describe('Project Detail Page', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      const company = await createTestCompany(request, user.id)
      const project = await createTestProject(request, user.id, company.id, {
        name: `Detail Test Project ${Date.now()}`,
        description: 'A comprehensive test project',
        role: 'Lead Developer',
        technologies: ['Python', 'FastAPI', 'React', 'PostgreSQL'],
      })
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

  test('should display project name as heading', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Check project name is displayed as h1
    await expect(
      page.getByRole('heading', { name: testContext.project!.name })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should display project metadata', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Check role is displayed somewhere on the page
    await expect(
      page.getByText('Lead Developer').first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('should display technologies', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Check technologies are displayed (as tech badges in Basic Info tab)
    await expect(page.getByText('Python').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('React').first()).toBeVisible()
  })

  test('should display three tabs', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Three tabs should be visible
    await expect(page.getByRole('tab', { name: /Basic Info/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Analysis Summary/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Detailed Analysis/ })).toBeVisible()
  })

  test('should switch between tabs', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Click on "Analysis Summary" tab
    await page.getByRole('tab', { name: /Analysis Summary/ }).click()
    await page.waitForTimeout(300)

    // Click on "Detailed Analysis" tab
    await page.getByRole('tab', { name: /Detailed Analysis/ }).click()
    await page.waitForTimeout(300)

    // Click back to "Basic Info" tab
    await page.getByRole('tab', { name: /Basic Info/ }).click()
    await page.waitForTimeout(300)
  })

  test('should show Edit button', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // "Edit" button should be visible in the header
    await expect(
      page.getByRole('button', { name: 'Edit' })
    ).toBeVisible()
  })

  test('should open edit dialog', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Click "Edit" button
    await page.getByRole('button', { name: 'Edit' }).click()

    // Wait for edit dialog
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Dialog title should be "Edit Project"
    await expect(dialog.getByText('Edit Project')).toBeVisible()

    // Form fields should be pre-filled (uses "detail_edit_" prefix)
    const nameInput = dialog.locator('#detail_edit_name')
    await expect(nameInput).toHaveValue(testContext.project!.name)

    // Cancel the edit
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    // Dialog should close
    await expect(dialog).not.toBeVisible()
  })

  test('should edit project from detail page', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Click "Edit" button
    await page.getByRole('button', { name: 'Edit' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Update the short description
    const descInput = dialog.locator('#detail_edit_short_description')
    await descInput.clear()
    await descInput.fill('Updated description from E2E test')

    // Click "Save" button
    await dialog.getByRole('button', { name: 'Save' }).click()

    // Verify the dialog closes
    await expect(dialog).not.toBeVisible({ timeout: 5000 })

    // Verify updated description appears on the page
    await expect(
      page.getByText('Updated description from E2E test')
    ).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Project Achievements', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      const project = await createTestProject(request, user.id, undefined, {
        name: `Achievement Test Project ${Date.now()}`,
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

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page, testContext.user!)
  })

  test('should display achievements section in Basic Info', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Basic Info tab is default - should show "Achievements" section heading
    await expect(
      page.getByText('Achievements').first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('should display existing achievements', async ({ page, request }) => {
    // Add achievement via API
    await request.post(
      `${API_BASE_URL}/knowledge/projects/${testContext.project!.id}/achievements`,
      {
        data: {
          metric_name: 'API Achievement',
          metric_value: '100%',
          description: 'Created via API',
        },
      }
    )

    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Verify achievement is displayed
    await expect(
      page.getByText('API Achievement').first()
    ).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Project Analysis Section', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      const project = await createTestProject(request, user.id, undefined, {
        name: `Analysis Test Project ${Date.now()}`,
        git_url: 'https://github.com/facebook/react',
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

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page, testContext.user!)
  })

  test('should show analyze button for project with git URL', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // "Analyze Repo" button should be visible since the project has a git_url
    await expect(
      page.getByRole('button', { name: 'Analyze Repo' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show analysis language selector', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Analysis language selector should be visible (a Select with ko/en options)
    // It shows as a combobox button
    const languageSelector = page.locator('button[role="combobox"]').first()
    await expect(languageSelector).toBeVisible({ timeout: 5000 })
  })

  test('should show not analyzed state in tabs', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Click on "Analysis Summary" tab
    await page.getByRole('tab', { name: /Analysis Summary/ }).click()
    await page.waitForTimeout(300)

    // Should show "No analysis data" or similar message
    await expect(
      page.getByText(/No analysis data/).first()
    ).toBeVisible({ timeout: 5000 })
  })
})
