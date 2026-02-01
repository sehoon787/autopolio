import { test, expect } from '@playwright/test'

test.describe('Navigation & Layout', () => {
  test('should load the app and display sidebar', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

    // Check sidebar is visible
    const sidebar = page.locator('aside, [class*="sidebar"], [class*="Sidebar"], nav')
    await expect(sidebar.first()).toBeVisible({ timeout: 10000 })

    // Check some navigation element exists
    const navItems = page.locator('a, button').filter({ hasText: /dashboard|knowledge|project|설정|지식/i })
    const count = await navItems.count()
    expect(count).toBeGreaterThan(0)
  })

  test('should navigate to dashboard', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /dashboard/i }).click()
    await expect(page).toHaveURL(/.*dashboard/)
  })

  test('should navigate to companies page', async ({ page }) => {
    await page.goto('/knowledge/companies')
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

    // Check that companies page content is visible
    const content = page.locator('main, [class*="content"], h1, h2')
    await expect(content.first()).toBeVisible({ timeout: 10000 })
  })

  test('should navigate to projects page', async ({ page }) => {
    await page.goto('/knowledge/projects')
    await expect(page.locator('h1, h2').filter({ hasText: /project|프로젝트/i })).toBeVisible({ timeout: 10000 })
  })

  test('should navigate to platforms page', async ({ page }) => {
    await page.goto('/platforms')
    await expect(page.locator('h1, h2').filter({ hasText: /platform|플랫폼|이력서/i })).toBeVisible({ timeout: 10000 })
  })

  test('should navigate to settings page', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('h1, h2').filter({ hasText: /setting|설정/i })).toBeVisible({ timeout: 10000 })
  })
})
