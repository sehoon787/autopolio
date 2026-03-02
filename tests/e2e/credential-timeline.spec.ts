import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3035'

test.describe('Credential Timeline View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL)
    await page.evaluate(() => {
      localStorage.setItem('user_id', '46')
      localStorage.setItem('user_name', 'sehoon787')
    })
    await page.goto(BASE_URL)
    await page.waitForLoadState('domcontentloaded')
    await page.locator('nav').first().waitFor({ state: 'visible', timeout: 10000 })
  })

  test('CertificationsAwards page shows timeline toggle and switches views', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/certifications-awards`)
    await page.waitForLoadState('domcontentloaded')

    // Check toggle buttons exist
    const listBtn = page.locator('button', { hasText: /목록|List/ })
    const timelineBtn = page.locator('button', { hasText: /타임라인|Timeline/ })
    await expect(listBtn.first()).toBeVisible()
    await expect(timelineBtn.first()).toBeVisible()

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
    await page.goto(`${BASE_URL}/knowledge/education-publications-patents`)
    await page.waitForLoadState('domcontentloaded')

    const listBtn = page.locator('button', { hasText: /목록|List/ })
    const timelineBtn = page.locator('button', { hasText: /타임라인|Timeline/ })
    await expect(listBtn.first()).toBeVisible()
    await expect(timelineBtn.first()).toBeVisible()

    const tabsList = page.locator('[role="tablist"]')
    await expect(tabsList).toBeVisible()

    await timelineBtn.first().click()
    await expect(tabsList).not.toBeVisible()

    await listBtn.first().click()
    await expect(tabsList).toBeVisible()
  })

  test('Activities page shows timeline toggle and switches views', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/activities`)
    await page.waitForLoadState('domcontentloaded')

    const listBtn = page.locator('button', { hasText: /목록|List/ })
    const timelineBtn = page.locator('button', { hasText: /타임라인|Timeline/ })
    await expect(listBtn.first()).toBeVisible()
    await expect(timelineBtn.first()).toBeVisible()

    const tabsList = page.locator('[role="tablist"]')
    await expect(tabsList).toBeVisible()

    await timelineBtn.first().click()
    await expect(tabsList).not.toBeVisible()

    await listBtn.first().click()
    await expect(tabsList).toBeVisible()
  })

  test('Add button in timeline mode switches back to list mode', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/certifications-awards`)
    await page.waitForLoadState('domcontentloaded')

    // Switch to timeline
    const timelineBtn = page.locator('button', { hasText: /타임라인|Timeline/ })
    await timelineBtn.first().click()

    const tabsList = page.locator('[role="tablist"]')
    await expect(tabsList).not.toBeVisible()

    // Click add button
    const addBtn = page.locator('button', { hasText: /추가|Add/ })
    await addBtn.first().click()

    // Should switch back to list mode - tabs visible again
    await expect(tabsList).toBeVisible()
  })
})
