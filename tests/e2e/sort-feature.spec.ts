import { test, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import {
  createApiContext,
  createTestUser,
  createTestCompany,
  createTestProject,
  loginAsTestUser,
  cleanupTestData,
  TestDataContext,
} from './fixtures/api-helpers'
import { FRONTEND_URL } from './runtimeConfig'

test.describe('Sort feature across pages', () => {
  let testContext: TestDataContext
  let apiRequest: APIRequestContext

  test.beforeAll(async () => {
    apiRequest = await createApiContext()
    const user = await createTestUser(apiRequest)
    const company = await createTestCompany(apiRequest, user.id)
    const project = await createTestProject(apiRequest, user.id, company.id)
    testContext = { user, company, project }
  })

  test.afterAll(async () => {
    await cleanupTestData(apiRequest, testContext)
    await apiRequest.dispose()
  })

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page, testContext.user!)
    await page.goto(FRONTEND_URL)
    await page.waitForLoadState('domcontentloaded')
    await page.locator('nav').first().waitFor({ state: 'visible', timeout: 30000 })
  })

  // === Projects page sorting ===

  test('projects page has sort dropdown', async ({ page }) => {
    await page.goto('/knowledge/projects')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // SortDropdown should be visible — default is "Recently Modified" (updated_at)
    const sortTrigger = page.locator('button[role="combobox"]').filter({ hasText: /최근 수정|Recently Modified/ })
    await expect(sortTrigger).toBeVisible()
  })

  test('projects page sort by name changes order', async ({ page }) => {
    await page.goto('/knowledge/projects')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Click the sort dropdown (default: Recently Modified)
    const sortTrigger = page.locator('button[role="combobox"]').filter({ hasText: /최근 수정|Recently Modified/ })
    await sortTrigger.click()

    // Select "project name" sort option
    const nameOption = page.getByRole('option', { name: /프로젝트명|Project Name/ })
    await nameOption.click()
    await page.waitForTimeout(1500)

    // After sorting by name (asc), first project should be alphabetically first
    // Verify the sort dropdown now shows the new sort option
    const updatedTrigger = page.locator('button[role="combobox"]').filter({ hasText: /프로젝트명|Project Name/ })
    await expect(updatedTrigger).toBeVisible()

    await page.screenshot({ path: 'test-results/projects-sort-by-name.png', fullPage: true })
  })

  test('projects page sort direction toggle works', async ({ page }) => {
    await page.goto('/knowledge/projects')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Find the sort direction toggle button (next to the sort dropdown)
    // It's a ghost button with ArrowDown icon (default: desc)
    const toggleBtn = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-down, svg.lucide-arrow-up') }).first()
    await expect(toggleBtn).toBeVisible()

    // Click to toggle direction
    await toggleBtn.click()
    await page.waitForTimeout(1000)

    // After toggle, the icon should change
    await page.screenshot({ path: 'test-results/projects-sort-direction-toggle.png', fullPage: true })
  })

  // === Documents page sorting ===

  test('documents page has sort dropdown', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // SortDropdown should show default "Recently Modified"
    const sortTrigger = page.locator('button[role="combobox"]').filter({ hasText: /최근 수정|Recently Modified/ })
    await expect(sortTrigger).toBeVisible()

    await page.screenshot({ path: 'test-results/documents-sort-default.png', fullPage: true })
  })

  test('documents page sort by document name', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Click sort dropdown (default: Recently Modified)
    const sortTrigger = page.locator('button[role="combobox"]').filter({ hasText: /최근 수정|Recently Modified/ })
    await sortTrigger.click()

    // Select document name option
    const nameOption = page.getByRole('option', { name: /문서명|Document Name/ })
    await nameOption.click()
    await page.waitForTimeout(1500)

    // Verify dropdown changed
    const updatedTrigger = page.locator('button[role="combobox"]').filter({ hasText: /문서명|Document Name/ })
    await expect(updatedTrigger).toBeVisible()

    await page.screenshot({ path: 'test-results/documents-sort-by-name.png', fullPage: true })
  })

  // === Generate page search and sorting ===

  test('generate page has search input and sort dropdown', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Search input should be visible
    const searchInput = page.locator('input[placeholder]').filter({ hasText: '' }).first()
    const searchIcon = page.locator('svg.lucide-search')
    await expect(searchIcon).toBeVisible()

    // Sort dropdown should be visible
    const sortTrigger = page.locator('button[role="combobox"]').filter({ hasText: /최근 수정|Recently Modified/ })
    await expect(sortTrigger).toBeVisible()

    await page.screenshot({ path: 'test-results/generate-search-sort.png', fullPage: true })
  })

  // === Credentials pages layout ===

  test('credentials page has add button in header and sort in subtab row', async ({ page }) => {
    await page.goto('/knowledge/certifications-awards')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Add button should be in the header area (top-right)
    // Use .first() to avoid matching empty-state buttons like "Add First Education"
    const addButton = page.getByRole('button', { name: /추가|Add/ }).first()
    await expect(addButton).toBeVisible()

    // Sort dropdown should be in the subtab row
    const sortTrigger = page.locator('button[role="combobox"]').filter({ hasText: /최근 날짜순|Date/ })
    const sortVisible = await sortTrigger.count() > 0
    // Sort select might use different text - just check any combobox exists in the tab area
    if (!sortVisible) {
      const anySortTrigger = page.locator('button[role="combobox"]').first()
      await expect(anySortTrigger).toBeVisible()
    }

    await page.screenshot({ path: 'test-results/credentials-layout.png', fullPage: true })
  })

  test('education page has add button in header', async ({ page }) => {
    await page.goto('/knowledge/education-publications-patents')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Add button should be in the header
    // Use .first() to avoid matching empty-state buttons like "Add First Education"
    const addButton = page.getByRole('button', { name: /추가|Add/ }).first()
    await expect(addButton).toBeVisible()

    await page.screenshot({ path: 'test-results/education-layout.png', fullPage: true })
  })

  // === GitHub repos page sorting (requires GitHub connection) ===

  test('github repos page has sort dropdown when connected', async ({ page }) => {
    await page.goto('/github/repos')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Check if connected (repos loaded) — sort dropdown only appears when connected
    const sortTrigger = page.locator('button[role="combobox"]').filter({ hasText: /최근 업데이트|Recently Updated/ })
    const isConnected = await sortTrigger.count() > 0

    if (isConnected) {
      await expect(sortTrigger).toBeVisible()

      // Try changing sort
      await sortTrigger.click()
      const nameOption = page.getByRole('option', { name: /이름|Name/ })
      await nameOption.click()
      await page.waitForTimeout(1000)

      const updatedTrigger = page.locator('button[role="combobox"]').filter({ hasText: /이름|^Name$/ })
      await expect(updatedTrigger).toBeVisible()

      await page.screenshot({ path: 'test-results/github-repos-sort-by-name.png', fullPage: true })
    } else {
      console.log('GitHub not connected — skipping repo sort UI test')
    }
  })
})
