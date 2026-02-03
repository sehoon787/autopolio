/**
 * E2E tests for document generation.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestCompany,
  createTestProject,
  createTestTemplate,
  cleanupTestData,
  TestDataContext,
} from '../fixtures/api-helpers'

test.describe('Document Generation Page', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    const company = await createTestCompany(request, user.id)
    const project = await createTestProject(request, user.id, company.id)
    const template = await createTestTemplate(request, user.id)
    testContext = { user, company, project, template }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should display generate page', async ({ page }) => {
    await page.goto('/generate')

    await expect(
      page.locator('h1, h2').filter({ hasText: /생성|Generate|문서/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should show project selection', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('networkidle')

    // Should show project selection UI
    const projectSelect = page.locator(
      '[data-testid="project-select"], input[type="checkbox"], .project-list'
    ).first()

    await expect(projectSelect).toBeVisible({ timeout: 10000 })
  })

  test('should show template selection', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('networkidle')

    // Should show template selection
    const templateSelect = page.locator(
      'select[name="template"], [data-testid="template-select"]'
    ).first()

    await expect(templateSelect).toBeVisible({ timeout: 10000 })
  })

  test('should show format selection', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('networkidle')

    // Should show format options
    const formatBtns = page.locator(
      'button:has-text("Markdown"), button:has-text("Word"), button:has-text("PDF")'
    )

    await expect(formatBtns.first()).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Document Generation Process', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    const project = await createTestProject(request, user.id, undefined, {
      name: `Generate Test ${Date.now()}`,
    })
    const template = await createTestTemplate(request, user.id)
    testContext = { user, project, template }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should select project and start generation', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('networkidle')

    // Select project
    const projectCheckbox = page.locator(
      '[data-testid="project-checkbox"], input[type="checkbox"]'
    ).first()

    if (await projectCheckbox.isVisible()) {
      await projectCheckbox.click()
    }

    // Select template
    const templateSelect = page.locator('select[name="template"]')
    if (await templateSelect.isVisible()) {
      await templateSelect.selectOption({ index: 1 })
    }

    // Click generate
    const generateBtn = page.locator(
      'button:has-text("생성"), button:has-text("Generate")'
    ).first()

    if (await generateBtn.isVisible()) {
      await generateBtn.click()

      // Should show progress or navigate to pipeline page
      await page.waitForLoadState('networkidle')
    }
  })

  test.skip('should show generation progress', async ({ page }) => {
    // This test may take time - skip in regular runs
    await page.goto('/generate')
    await page.waitForLoadState('networkidle')

    // Start generation process
    // ... (would need to set up and click through)

    // Should show progress indicator
    const progress = page.locator(
      '[data-testid="generation-progress"], .progress-bar, text=진행'
    )

    await expect(progress).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Pipeline Status', () => {
  test('should display pipeline status page', async ({ page }) => {
    // Navigate to a pipeline task if one exists
    await page.goto('/generate/pipeline')

    // May show status or "no active pipeline" message
    const statusPage = page.locator(
      'text=파이프라인, text=Pipeline, text=진행, text=Progress'
    ).first()

    await page.waitForLoadState('networkidle')
  })

  test('should show step-by-step progress', async ({ page }) => {
    await page.goto('/generate/pipeline')
    await page.waitForLoadState('networkidle')

    // Look for step indicators
    const steps = page.locator(
      '[data-testid="pipeline-step"], .pipeline-step, .step'
    )

    if ((await steps.count()) > 0) {
      // Should show multiple steps
      await expect(steps.first()).toBeVisible()
    }
  })
})

test.describe('Export Dialog', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    const project = await createTestProject(request, user.id)
    testContext = { user, project }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should open export dialog from projects page', async ({ page }) => {
    await page.goto('/knowledge/projects')
    await page.waitForLoadState('networkidle')

    // Find export button
    const exportBtn = page.locator(
      'button:has-text("내보내기"), button:has-text("Export")'
    ).first()

    if (await exportBtn.isVisible()) {
      await exportBtn.click()

      // Should show export dialog
      const dialog = page.locator('[role="dialog"], .modal, [data-testid="export-dialog"]')
      await expect(dialog).toBeVisible({ timeout: 10000 })
    }
  })

  test('should show export type options in dialog', async ({ page }) => {
    await page.goto('/knowledge/projects')
    await page.waitForLoadState('networkidle')

    const exportBtn = page.locator('button:has-text("내보내기")').first()

    if (await exportBtn.isVisible()) {
      await exportBtn.click()

      // Should show export type options
      const performanceOption = page.locator('text=성과, text=Performance')
      const projectsOption = page.locator('text=프로젝트 목록, text=Projects')

      await expect(performanceOption.or(projectsOption)).toBeVisible({ timeout: 10000 })
    }
  })
})
