import { test, expect } from '@playwright/test'
import { API_URL } from './runtimeConfig'

test.describe('Companies Page', () => {
  let userId: number

  test.beforeAll(async ({ request }) => {
    // Create a test user to ensure the page renders
    const response = await request.post(`${API_URL}/api/users`, {
      data: { name: 'E2E Companies Test', email: `e2e-companies-${Date.now()}@test.com` },
    })
    const user = await response.json()
    userId = user.id
  })

  test.afterAll(async ({ request }) => {
    if (userId) {
      await request.delete(`${API_URL}/api/users/${userId}`).catch(() => {})
    }
  })

  test.beforeEach(async ({ page }) => {
    // Set user in localStorage so the app recognizes the logged-in user
    await page.goto('/')
    await page.evaluate((uid) => {
      const userData = { state: { user: { id: uid, name: 'E2E Companies Test', email: 'e2e@test.com' }, isGuest: false }, version: 0 }
      localStorage.setItem('user-storage', JSON.stringify(userData))
    }, userId)
    await page.goto('/knowledge/companies')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  })

  test('should display companies page header', async ({ page }) => {
    const header = page.locator('h1, h2').filter({ hasText: /compan|회사|경력/i })
    await expect(header).toBeVisible({ timeout: 20000 })
  })

  test('should have add company button', async ({ page }) => {
    const addButton = page.locator('button').filter({ hasText: /add|create|new|추가|생성/i })
    await expect(addButton.first()).toBeVisible({ timeout: 10000 })
  })

  test('should open create company dialog', async ({ page }) => {
    const addButton = page.locator('button').filter({ hasText: /add|create|new|추가|생성/i }).first()
    await addButton.click()

    // Check dialog appears
    const dialog = page.locator('[role="dialog"], [class*="Dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })
  })

  test('should display company list or empty state', async ({ page }) => {
    // Either shows list or empty state message
    const content = page.locator('main, [class*="content"], [class*="Content"], [class*="container"]')
    await expect(content.first()).toBeVisible({ timeout: 10000 })
  })
})
