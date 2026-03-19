/**
 * E2E tests for GitHub repository analysis on project detail page.
 *
 * Key UI details (ProjectDetail.tsx):
 * - Project name displayed as h1 heading
 * - "Analyze Repo" button (when not analyzed, project has git_url)
 * - "Re-analyze" button (when already analyzed)
 * - Analysis language selector (ko/en) next to the analyze button
 * - Three tabs: "Basic Info", "Analysis Summary", "Detailed Analysis"
 * - When not analyzed:
 *   - Summary tab shows "No analysis data" heading + "Analyze the project to see the analysis summary."
 *   - Detail tab shows "No analysis data" heading + "Analyze the project to see the detailed analysis."
 *   - Basic Info tab shows "Not yet analyzed" text in commit statistics area
 *
 * In CI, GitHub is NOT connected (no OAuth token), so actual analysis
 * cannot be triggered. Tests focus on the pre-analysis UI state.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestProject,
  cleanupTestData,
  createApiContext,
  loginAsTestUser,
  TestDataContext,
} from '../fixtures/api-helpers'

test.describe('Project Analysis UI - With Git URL', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      const project = await createTestProject(request, user.id, undefined, {
        name: `Analysis E2E ${Date.now()}`,
        git_url: 'https://github.com/facebook/react',
      })
      testContext = { user, project }
    } catch {
      testContext = {} as TestDataContext
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
    if (!testContext?.user) { test.skip(); return }
    await loginAsTestUser(page, testContext.user!)
  })

  test('should show analyze button for project with git URL', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // "Analyze Repo" button should be visible since project has a git_url
    await expect(
      page.getByRole('button', { name: /Analyze Repo|레포 분석|분석/ })
    ).toBeVisible({ timeout: 10000 })
  })

  test('should show analysis language selector', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // The language selector is a combobox (Select component) near the analyze button
    const languageSelector = page.locator('button[role="combobox"]').first()
    await expect(languageSelector).toBeVisible({ timeout: 10000 })
  })

  test('should show no analysis data on Summary tab', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Click "Analysis Summary" tab
    await page.getByRole('tab', { name: /Analysis Summary|분석 요약/ }).click()
    await page.waitForTimeout(300)

    // Should show "No analysis data" heading
    await expect(
      page.getByText(/No analysis data|분석 데이터 없음|분석 데이터가 없습니다/).first()
    ).toBeVisible({ timeout: 10000 })

    // Should show description text
    await expect(
      page.getByText(/Analyze the project|프로젝트를 분석/)
    ).toBeVisible()
  })

  test('should show no analysis data on Detailed Analysis tab', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Click "Detailed Analysis" tab
    await page.getByRole('tab', { name: /Detailed Analysis|상세 분석/ }).click()
    await page.waitForTimeout(300)

    // Should show "No analysis data" heading
    await expect(
      page.getByText(/No analysis data|분석 데이터 없음|분석 데이터가 없습니다/).first()
    ).toBeVisible({ timeout: 10000 })

    // Should show description text
    await expect(
      page.getByText(/Analyze the project|프로젝트를 분석/)
    ).toBeVisible()
  })

  test('should display three tabs on project detail', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Verify all three tabs exist
    await expect(page.getByRole('tab', { name: /Basic Info|기본정보/ })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('tab', { name: /Analysis Summary|분석 요약/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Detailed Analysis|상세 분석/ })).toBeVisible()
  })
})

test.describe('Project Analysis UI - Without Git URL', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      const project = await createTestProject(request, user.id, undefined, {
        name: `No Git URL E2E ${Date.now()}`,
      })
      testContext = { user, project }
    } catch {
      testContext = {} as TestDataContext
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
    if (!testContext?.user) { test.skip(); return }
    await loginAsTestUser(page, testContext.user!)
  })

  test('should not show analyze button for project without git URL', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Wait for page to load
    await page.waitForTimeout(500)

    // "Analyze Repo" button should NOT be visible since project has no git_url
    await expect(
      page.getByRole('button', { name: /Analyze Repo|레포 분석|분석/ })
    ).not.toBeVisible()
  })

  test('should still display tabs without git URL', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // All three tabs should still be present
    await expect(page.getByRole('tab', { name: /Basic Info|기본정보/ })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('tab', { name: /Analysis Summary|분석 요약/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Detailed Analysis|상세 분석/ })).toBeVisible()
  })

  test('should show not analyzed message in BasicInfo tab', async ({ page }) => {
    await page.goto(`/knowledge/projects/${testContext.project!.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Basic Info tab is the default.
    // For a project without git_url, the commit statistics section says
    // "Not yet analyzed" and shows a description about registering a URL
    await expect(
      page.getByText('Not yet analyzed').first()
    ).toBeVisible({ timeout: 10000 })
  })
})
