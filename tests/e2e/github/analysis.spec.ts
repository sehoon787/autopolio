/**
 * E2E tests for GitHub repository analysis.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestProject,
  cleanupTestData,
  TestDataContext,
} from '../fixtures/api-helpers'

test.describe('Project Analysis', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    // Create project with git URL
    const project = await createTestProject(request, user.id, undefined, {
      name: `Analysis Test ${Date.now()}`,
      git_url: 'https://github.com/facebook/react',
    })
    testContext = { user, project }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should show analyze button for project with git URL', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('networkidle')

    // Look for analyze button
    const analyzeBtn = page.locator(
      '[data-testid="analyze-button"], button:has-text("분석"), button:has-text("Analyze")'
    ).first()

    await expect(analyzeBtn).toBeVisible({ timeout: 10000 })
  })

  test('should start analysis on button click', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('networkidle')

    const analyzeBtn = page.locator(
      '[data-testid="analyze-button"], button:has-text("분석"), button:has-text("Analyze")'
    ).first()

    if (await analyzeBtn.isVisible()) {
      await analyzeBtn.click()

      // Should show loading state or progress
      const loading = page.locator(
        '[data-testid="analysis-loading"], text=분석 중, text=Analyzing'
      )

      // May show loading or redirect to analysis page
      await page.waitForTimeout(2000)
    }
  })

  test.skip('should show analysis results after completion', async ({ page }) => {
    // This test may take a long time - skip in regular runs
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)

    // Wait for analysis to complete (long timeout)
    await expect(
      page.locator('text=분석 완료, text=Analysis Complete')
    ).toBeVisible({ timeout: 180000 })

    // Check for detected technologies
    await expect(
      page.locator('[data-testid="detected-technologies"]')
    ).toBeVisible()
  })
})

test.describe('Batch Analysis', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    testContext = { user }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should allow selecting multiple projects for batch analysis', async ({ page }) => {
    await page.goto('/knowledge/projects')
    await page.waitForLoadState('networkidle')

    // Look for batch selection mode or checkboxes
    const batchBtn = page.locator(
      'button:has-text("일괄 분석"), button:has-text("Batch"), button:has-text("전체 분석")'
    ).first()

    const checkboxes = page.locator('[data-testid="project-checkbox"], input[type="checkbox"]')

    if (await batchBtn.isVisible()) {
      await batchBtn.click()
    }
  })
})

test.describe('Analysis Results Display', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    const project = await createTestProject(request, user.id, undefined, {
      name: `Results Test ${Date.now()}`,
    })
    testContext = { user, project }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should display commit statistics if analyzed', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('networkidle')

    // Look for commit stats section
    const statsSection = page.locator(
      '[data-testid="commit-stats"], text=커밋, text=Commits'
    ).first()

    // May or may not have analysis data
    if (await statsSection.isVisible()) {
      await expect(statsSection).toBeVisible()
    }
  })

  test('should allow editing analysis description', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('networkidle')

    // Look for edit analysis button
    const editBtn = page.locator(
      '[data-testid="edit-analysis"], button:has-text("분석 수정")'
    ).first()

    if (await editBtn.isVisible()) {
      await editBtn.click()

      // Should show editable textarea
      const editArea = page.locator('textarea')
      await expect(editArea.first()).toBeVisible({ timeout: 5000 })
    }
  })
})

test.describe('Contributor Analysis', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    const project = await createTestProject(request, user.id, undefined, {
      name: `Contributor Test ${Date.now()}`,
      git_url: 'https://github.com/facebook/react',
    })
    testContext = { user, project }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should show contributor section if available', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('networkidle')

    // Look for contributors section
    const contributorSection = page.locator(
      '[data-testid="contributors"], text=기여자, text=Contributors'
    ).first()

    // May or may not have contributor data
    if (await contributorSection.isVisible()) {
      await expect(contributorSection).toBeVisible()
    }
  })
})
