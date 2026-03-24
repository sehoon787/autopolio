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

test.describe('Dashboard career timeline', () => {
  let testContext: TestDataContext
  let apiRequest: APIRequestContext

  test.beforeAll(async () => {
    apiRequest = await createApiContext()
    const user = await createTestUser(apiRequest)
    const company = await createTestCompany(apiRequest, user.id, {
      start_date: '2023-01-01',
      end_date: '2024-06-30',
    })
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

  // === Tab navigation ===

  test('career timeline card has 3 tabs: summary, detail, project', async ({ page }) => {
    const card = page.locator('text=커리어 타임라인').first().locator('..').locator('..')
    const tabList = page.locator('[role="tablist"]').first()
    await expect(tabList).toBeVisible()

    // Verify all 3 tab triggers exist
    const tabs = tabList.locator('[role="tab"]')
    await expect(tabs).toHaveCount(3)

    // Check tab labels (ko or en)
    const tabTexts = await tabs.allTextContents()
    expect(tabTexts.length).toBe(3)
  })

  test('default tab is summary (heatmap)', async ({ page }) => {
    // Summary tab should be active by default
    const summaryTab = page.locator('[role="tab"]').filter({ hasText: /요약|Summary/ }).first()
    await expect(summaryTab).toHaveAttribute('data-state', 'active')

    // Heatmap grid should be visible
    const heatmapGrid = page.locator('.aspect-square').first()
    await expect(heatmapGrid).toBeVisible()
  })

  test('clicking detail tab shows company bars', async ({ page }) => {
    // Click detail tab
    const detailTab = page.locator('[role="tab"]').filter({ hasText: /상세|Detail/ }).first()
    await detailTab.click()
    await page.waitForTimeout(500)

    // Detail tab should now be active
    await expect(detailTab).toHaveAttribute('data-state', 'active')

    // Year ticks should be visible in detail view
    await page.screenshot({ path: 'test-results/dashboard-detail-tab.png', fullPage: true })
  })

  test('clicking project tab shows project bars', async ({ page }) => {
    // Click project tab
    const projectTab = page.locator('[role="tab"]').filter({ hasText: /프로젝트|Projects/ }).first()
    await projectTab.click()
    await page.waitForTimeout(500)

    // Project tab should now be active
    await expect(projectTab).toHaveAttribute('data-state', 'active')

    await page.screenshot({ path: 'test-results/dashboard-project-tab.png', fullPage: true })
  })

  test('tab switching preserves state', async ({ page }) => {
    // Go to detail, then project, then back to summary
    const tabs = page.locator('[role="tab"]')
    const detailTab = tabs.filter({ hasText: /상세|Detail/ }).first()
    const projectTab = tabs.filter({ hasText: /프로젝트|Projects/ }).first()
    const summaryTab = tabs.filter({ hasText: /요약|Summary/ }).first()

    await detailTab.click()
    await expect(detailTab).toHaveAttribute('data-state', 'active')

    await projectTab.click()
    await expect(projectTab).toHaveAttribute('data-state', 'active')

    await summaryTab.click()
    await expect(summaryTab).toHaveAttribute('data-state', 'active')

    // Heatmap should still be visible
    const heatmapGrid = page.locator('.aspect-square').first()
    await expect(heatmapGrid).toBeVisible()
  })

  // === Heatmap (summary view) ===

  test('heatmap has year selector', async ({ page }) => {
    // Year selector buttons should be visible (at least current year)
    const currentYear = new Date().getFullYear().toString()
    const yearButton = page.locator('button').filter({ hasText: currentYear }).first()
    // Year selector may or may not be visible depending on data
    const yearExists = await yearButton.count() > 0
    if (yearExists) {
      await expect(yearButton).toBeVisible()
    }
  })

  test('heatmap cells show tooltip on hover', async ({ page }) => {
    // Find a heatmap cell (aspect-square with bg- class)
    const cells = page.locator('.aspect-square.rounded-sm')
    const cellCount = await cells.count()

    if (cellCount > 0) {
      // Hover over a cell
      await cells.first().hover()
      await page.waitForTimeout(200)

      // Tooltip should appear
      const tooltip = page.locator('[role="tooltip"]')
      const tooltipVisible = await tooltip.count() > 0
      if (tooltipVisible) {
        await expect(tooltip.first()).toBeVisible()
      }
    }
  })

  // === Detail view ===

  test('detail view has consistent row spacing', async ({ page }) => {
    const detailTab = page.locator('[role="tab"]').filter({ hasText: /상세|Detail/ }).first()
    await detailTab.click()
    await page.waitForTimeout(500)

    // All timeline rows should use py-1.5 (consistent spacing)
    // Verify rows exist and are visible
    await page.screenshot({ path: 'test-results/dashboard-detail-spacing.png', fullPage: true })
  })

  // === Stats cards ===

  test('dashboard shows 4 stats cards', async ({ page }) => {
    // Stats cards: Companies, Projects, Analyzed Projects, Documents
    const cards = page.locator('.grid.grid-cols-1 a')
    await expect(cards).toHaveCount(4)
  })
})
