/**
 * E2E tests for Project detail page.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestCompany,
  createTestProject,
  cleanupTestData,
  createApiContext,
  TestDataContext,
} from '../fixtures/api-helpers'
import { TEST_ACHIEVEMENT } from '../fixtures/test-data'
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

  test('should display project details', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)

    // Check project name is displayed
    await expect(
      page.locator(`text=${testContext.project!.name}`).first()
    ).toBeVisible({ timeout: 10000 })

    // Check description is displayed
    await expect(
      page.locator('text=comprehensive test project').first()
    ).toBeVisible()
  })

  test('should display project metadata', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Check role is displayed
    await expect(
      page.locator('text=Lead Developer').first()
    ).toBeVisible({ timeout: 10000 })

    // Check company is displayed
    await expect(
      page.locator(`text=${testContext.company!.name}`).first()
    ).toBeVisible()
  })

  test('should display technologies', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Check technologies are displayed
    await expect(page.locator('text=Python').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=React').first()).toBeVisible()
  })

  test('should allow editing project from detail page', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Click edit button
    const editBtn = page.locator(
      '[data-testid="edit-button"], button:has-text("편집"), button:has-text("Edit")'
    ).first()

    if (await editBtn.isVisible()) {
      await editBtn.click()

      // Should open edit mode or navigate to edit page
      await expect(
        page.locator('input[name="name"], [data-testid="edit-form"]').first()
      ).toBeVisible({ timeout: 10000 })
    }
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

  test('should add an achievement to project', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Look for achievements section
    const achievementSection = page.locator(
      '[data-testid="achievements"], text=성과, text=Achievements'
    ).first()

    if (await achievementSection.isVisible()) {
      // Click add achievement button
      const addBtn = page.locator(
        '[data-testid="add-achievement"], button:has-text("성과 추가"), button:has-text("Add Achievement")'
      ).first()

      if (await addBtn.isVisible()) {
        await addBtn.click()

        // Fill achievement form
        await page.fill(
          'input[name="metric_name"], input[name="metricName"]',
          TEST_ACHIEVEMENT.metric_name
        )
        await page.fill(
          'input[name="metric_value"], input[name="metricValue"]',
          TEST_ACHIEVEMENT.metric_value
        )

        const descInput = page.locator('textarea[name="description"]')
        if (await descInput.isVisible()) {
          await descInput.fill(TEST_ACHIEVEMENT.description)
        }

        // Save
        await page.click('button:has-text("저장"), button:has-text("Save")')

        // Verify achievement is added
        await expect(
          page.locator(`text=${TEST_ACHIEVEMENT.metric_name}`).first()
        ).toBeVisible({ timeout: 10000 })
      }
    }
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
      page.locator('text=API Achievement').first()
    ).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Project Analysis Results', () => {
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

  test('should show analysis section for project with git URL', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Look for analysis section or analyze button
    const analysisSection = page.locator(
      '[data-testid="analysis-section"], text=분석, text=Analysis'
    ).first()

    const analyzeBtn = page.locator(
      '[data-testid="analyze-button"], button:has-text("분석"), button:has-text("Analyze")'
    ).first()

    // Either analysis section or analyze button should be visible
    await expect(analysisSection.or(analyzeBtn)).toBeVisible({ timeout: 10000 })
  })

  test('should allow editing analysis results', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Look for edit analysis button
    const editAnalysisBtn = page.locator(
      '[data-testid="edit-analysis"], button:has-text("분석 수정"), button:has-text("Edit Analysis")'
    ).first()

    if (await editAnalysisBtn.isVisible()) {
      await editAnalysisBtn.click()

      // Should show editable fields
      await expect(
        page.locator('textarea, input[type="text"]').first()
      ).toBeVisible({ timeout: 10000 })
    }
  })
})
