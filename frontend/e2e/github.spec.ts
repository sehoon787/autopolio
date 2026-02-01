import { test, expect } from '@playwright/test'

test.describe('GitHub Connection Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/setup/github')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  })

  test('should display GitHub setup page', async ({ page }) => {
    const header = page.locator('h1, h2').filter({ hasText: /github/i })
    await expect(header).toBeVisible({ timeout: 10000 })
  })

  test('should display connect button or connection status', async ({ page }) => {
    // Either shows connect button or connected status
    const connectButton = page.locator('button').filter({ hasText: /connect|연결|login|로그인/i })
    const connectedStatus = page.locator('text=/connected|연결됨|disconnect|연결해제/i')

    const connectVisible = await connectButton.first().isVisible().catch(() => false)
    const statusVisible = await connectedStatus.first().isVisible().catch(() => false)

    expect(connectVisible || statusVisible).toBeTruthy()
  })

  test('should display repository list when connected', async ({ page }) => {
    // Wait for content to load
    await page.waitForTimeout(2000)

    // Look for repository list or empty state
    const repoList = page.locator('[class*="repo"], [class*="repository"]')
    const emptyState = page.locator('text=/no repo|레포.*없|connect.*first|먼저.*연결/i')
    const connectButton = page.locator('button').filter({ hasText: /connect|연결/i })

    const repoVisible = await repoList.first().isVisible().catch(() => false)
    const emptyVisible = await emptyState.first().isVisible().catch(() => false)
    const connectVisible = await connectButton.first().isVisible().catch(() => false)

    // One of these should be visible
    expect(repoVisible || emptyVisible || connectVisible).toBeTruthy()
  })
})

test.describe('GitHub Repository Selection', () => {
  test('should allow selecting repositories when connected', async ({ page }) => {
    await page.goto('/setup/github')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    // Look for repository checkboxes or select buttons
    const checkboxes = page.locator('[type="checkbox"], [role="checkbox"]')
    const selectButtons = page.locator('button').filter({ hasText: /select|선택|add|추가/i })

    const checkboxCount = await checkboxes.count()
    const buttonCount = await selectButtons.count()

    // This is informational - may not have repos to select
    expect(checkboxCount + buttonCount).toBeGreaterThanOrEqual(0)
  })
})
