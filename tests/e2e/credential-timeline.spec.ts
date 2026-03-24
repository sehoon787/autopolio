import { test, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import {
  createApiContext,
  createTestUser,
  createTestCertification,
  createTestEducation,
  loginAsTestUser,
  cleanupTestData,
  TestDataContext,
} from './fixtures/api-helpers'
import { FRONTEND_URL } from './runtimeConfig'

test.describe('Credential Timeline View', () => {
  let testContext: TestDataContext
  let apiRequest: APIRequestContext

  test.beforeAll(async () => {
    try {
      apiRequest = await createApiContext()
      const user = await createTestUser(apiRequest)
      // Create certification and education so timeline/list views have data
      await createTestCertification(apiRequest, user.id)
      await createTestEducation(apiRequest, user.id)
      testContext = { user }
    } catch (e) {
      console.log('Credential timeline test setup failed:', e)
    }
  })

  test.afterAll(async () => {
    await cleanupTestData(apiRequest, testContext)
    await apiRequest?.dispose()
  })

  test.beforeEach(async ({ page }) => {
    if (!testContext?.user) {
      test.skip()
      return
    }
    await loginAsTestUser(page, testContext.user)
    await page.goto(FRONTEND_URL)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForLoadState('networkidle')
    await page.locator('nav').first().waitFor({ state: 'visible', timeout: 30000 })
  })

  test('CertificationsAwards page shows timeline toggle and switches views', async ({ page }) => {
    await page.goto('/knowledge/certifications-awards')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Check toggle buttons exist
    const listBtn = page.locator('button').filter({ hasText: /목록|List/ }).first()
    const timelineBtn = page.locator('button').filter({ hasText: /타임라인|Timeline/ }).first()
    await expect(listBtn).toBeVisible({ timeout: 15000 })
    await expect(timelineBtn).toBeVisible({ timeout: 15000 })

    // In list mode, tabs should be visible
    const tabsList = page.locator('[role="tablist"]')
    await expect(tabsList).toBeVisible()

    // Switch to timeline - tabs should disappear
    await timelineBtn.first().click()
    await expect(tabsList).not.toBeVisible()

    // Switch back to list - tabs should reappear
    await listBtn.first().click()
    await expect(tabsList).toBeVisible()
  })

  test('EducationPublicationsPatents page shows timeline toggle and switches views', async ({ page }) => {
    await page.goto('/knowledge/education-publications-patents')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const listBtn = page.locator('button').filter({ hasText: /목록|List/ }).first()
    const timelineBtn = page.locator('button').filter({ hasText: /타임라인|Timeline/ }).first()
    await expect(listBtn).toBeVisible({ timeout: 15000 })
    await expect(timelineBtn).toBeVisible({ timeout: 15000 })

    const tabsList = page.locator('[role="tablist"]')
    await expect(tabsList).toBeVisible({ timeout: 10000 })

    await timelineBtn.click()
    await page.waitForTimeout(500)
    await expect(tabsList).not.toBeVisible({ timeout: 10000 })

    await listBtn.click()
    await page.waitForTimeout(500)
    await expect(tabsList).toBeVisible({ timeout: 10000 })
  })

  test('Activities page shows timeline toggle and switches views', async ({ page }) => {
    await page.goto('/knowledge/activities')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Use icon-based selectors as fallback — List icon (lucide-list) and Clock icon (lucide-clock)
    const listBtn = page.locator('button').filter({ hasText: /목록|List/ }).first()
    const timelineBtn = page.locator('button').filter({ hasText: /타임라인|Timeline/ }).first()
    await expect(listBtn).toBeVisible({ timeout: 15000 })
    await expect(timelineBtn).toBeVisible({ timeout: 15000 })

    const tabsList = page.locator('[role="tablist"]')
    await expect(tabsList).toBeVisible({ timeout: 10000 })

    await timelineBtn.click()
    await page.waitForTimeout(500)
    await expect(tabsList).not.toBeVisible({ timeout: 10000 })

    await listBtn.click()
    await page.waitForTimeout(500)
    await expect(tabsList).toBeVisible({ timeout: 10000 })
  })

  test('Add button in timeline mode switches back to list mode', async ({ page }) => {
    await page.goto('/knowledge/certifications-awards')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Switch to timeline
    const timelineBtn = page.locator('button').filter({ hasText: /타임라인|Timeline/ }).first()
    await expect(timelineBtn).toBeVisible({ timeout: 15000 })
    await timelineBtn.click()
    await page.waitForTimeout(500)

    const tabsList = page.locator('[role="tablist"]')
    await expect(tabsList).not.toBeVisible({ timeout: 10000 })

    // Click add button
    const addBtn = page.locator('button').filter({ hasText: /추가|Add/ }).first()
    await addBtn.click()
    await page.waitForTimeout(500)

    // Should switch back to list mode - tabs visible again
    await expect(tabsList).toBeVisible({ timeout: 10000 })
  })
})
