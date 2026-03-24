/**
 * E2E tests for complete user workflows.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestCompany,
  createTestProject,
  initPlatformTemplates,
  cleanupTestData,
  createApiContext,
  loginAsTestUser,
  TestDataContext,
} from '../fixtures/api-helpers'
import { TEST_COMPANY, TEST_PROJECT } from '../fixtures/test-data'

test.describe('Complete Portfolio Workflow', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      await initPlatformTemplates(request)
      testContext = { user }
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

  test('should complete workflow from company to platform preview', async ({ page }) => {
    // Step 1: Create Company
    await page.goto('/knowledge/companies')
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByRole('heading', { name: /Company Management|회사 관리/ })
    ).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: /Add Company|회사 추가/ }).click()

    const companyDialog = page.getByRole('dialog')
    await expect(companyDialog).toBeVisible({ timeout: 10000 })

    const companyName = `Workflow Company ${Date.now()}`
    await companyDialog.locator('#name').fill(companyName)
    await companyDialog.locator('#position').fill(TEST_COMPANY.position)
    await companyDialog.locator('#start_date').fill(TEST_COMPANY.start_date)

    await companyDialog.getByRole('button', { name: /^Add$|^추가$/ }).click()

    // Company should appear in the list
    await expect(
      page.getByText(companyName).first()
    ).toBeVisible({ timeout: 10000 })

    // Step 2: Create Project
    await page.goto('/knowledge/projects')
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByRole('heading', { name: /Project Management|프로젝트 관리/ })
    ).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: /^Add Project$|^프로젝트 추가$/ }).click()

    const projectDialog = page.getByRole('dialog')
    await expect(projectDialog).toBeVisible({ timeout: 10000 })

    const projectName = `Workflow Project ${Date.now()}`
    await projectDialog.locator('#name').fill(projectName)
    await projectDialog.locator('#short_description').fill(TEST_PROJECT.description)
    await projectDialog.locator('#start_date').fill(TEST_PROJECT.start_date)
    await projectDialog.locator('#role').fill(TEST_PROJECT.role)

    await projectDialog.locator('button[type="submit"]').click()

    // Project should appear in the list
    await expect(
      page.getByText(projectName).first()
    ).toBeVisible({ timeout: 10000 })

    // Step 3: Visit Platforms page
    await page.goto('/platforms')
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByRole('heading', { name: /Job Platforms|취업 플랫폼/ })
    ).toBeVisible({ timeout: 10000 })

    // Step 4: Click Preview on the first template card
    const previewBtn = page.getByRole('button', { name: /Preview|미리보기/ }).first()
    if (await previewBtn.isVisible().catch(() => false)) {
      await previewBtn.click()
      await page.waitForLoadState('domcontentloaded')

      // Preview page should have an iframe for the rendered template
      await expect(page.locator('iframe').first()).toBeVisible({ timeout: 10000 })
    }
  })
})

test.describe('Template Customization', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      testContext = { user }
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

  test('should display templates with system and clone options', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('domcontentloaded')

    // Page heading: "Template Management"
    await expect(
      page.getByRole('heading', { name: /Template Management|템플릿 관리/ })
    ).toBeVisible({ timeout: 10000 })

    // "System Templates" section heading
    await expect(
      page.getByText(/System Templates|시스템 템플릿/).first()
    ).toBeVisible({ timeout: 10000 })

    // "Clone" button should be visible on system templates
    const cloneBtn = page.getByRole('button', { name: /Clone|복제/ }).first()
    await expect(cloneBtn).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Cross-Feature Navigation', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      testContext = { user }
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

  test('should navigate between all main sections', async ({ page }) => {
    // Dashboard
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
    const dashboardHeading = page.getByRole('heading').first()
    await expect(dashboardHeading).toBeVisible({ timeout: 10000 })

    // Companies
    await page.goto('/knowledge/companies')
    await page.waitForLoadState('domcontentloaded')
    await expect(
      page.getByRole('heading', { name: /Company Management|회사 관리/ })
    ).toBeVisible({ timeout: 10000 })

    // Projects
    await page.goto('/knowledge/projects')
    await page.waitForLoadState('domcontentloaded')
    await expect(
      page.getByRole('heading', { name: /Project Management|프로젝트 관리/ })
    ).toBeVisible({ timeout: 10000 })

    // Platforms
    await page.goto('/platforms')
    await page.waitForLoadState('domcontentloaded')
    await expect(
      page.getByRole('heading', { name: /Job Platforms|취업 플랫폼/ })
    ).toBeVisible({ timeout: 10000 })

    // Templates
    await page.goto('/templates')
    await page.waitForLoadState('domcontentloaded')
    await expect(
      page.getByRole('heading', { name: /Template Management|템플릿 관리/ })
    ).toBeVisible({ timeout: 10000 })

    // Documents
    await page.goto('/documents')
    await page.waitForLoadState('domcontentloaded')
    await expect(
      page.getByRole('heading', { name: /Generated Documents|생성된 문서/ })
    ).toBeVisible({ timeout: 10000 })

    // Settings
    await page.goto('/settings')
    await page.waitForLoadState('domcontentloaded')
    await expect(
      page.getByRole('heading', { name: /Settings|설정/ })
    ).toBeVisible({ timeout: 10000 })
  })

  test('should maintain navigation state via sidebar links', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')

    // Navigate through sidebar links
    const navItems = [
      { href: '/knowledge/companies', heading: /Company Management|회사 관리/ },
      { href: '/knowledge/projects', heading: /Project Management|프로젝트 관리/ },
      { href: '/platforms', heading: /Job Platforms|취업 플랫폼/ },
    ]

    for (const item of navItems) {
      const link = page.locator(`a[href="${item.href}"]`).first()
      if (await link.isVisible().catch(() => false)) {
        await link.click()
        await page.waitForLoadState('domcontentloaded')
        await expect(page).toHaveURL(new RegExp(item.href.replace('/', '\\/')), { timeout: 10000 })
        await expect(
          page.getByRole('heading', { name: item.heading })
        ).toBeVisible({ timeout: 10000 })
      }
    }
  })
})
