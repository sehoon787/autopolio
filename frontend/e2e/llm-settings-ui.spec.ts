import { test, expect } from '@playwright/test'

test.describe('LLM Settings UI Consistency', () => {
  // Avoid conflicts with parallel settings tests (language switching)
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  })

  test('API tab: provider cards load with auth badges', async ({ page }) => {
    const apiTab = page.locator('button[role="tab"]').filter({ hasText: /API/i })
    await apiTab.click()

    // Wait for provider cards to finish loading
    const tabContent = page.locator('[role="tabpanel"]')
    await expect(
      tabContent.locator('.rounded-lg.border').first()
    ).toBeVisible({ timeout: 20000 })
    await expect(tabContent.locator('button[role="combobox"]').first()).toBeVisible({ timeout: 15000 })

    // Wait extra for auto-test to complete
    await page.waitForTimeout(3000)

    // Auth badge text should be visible in each provider card
    const badgeTexts = tabContent.getByText(/^Connected$|^Not Connected$|^연결됨$|^연결 안됨$|^Checking\.\.\.$|^확인 중\.\.\.$/i)
    expect(await badgeTexts.count()).toBeGreaterThan(0)

    await page.screenshot({ path: 'test-results/llm-api-auth-badges.png', fullPage: true })
  })

  test('API tab: model selection dropdown works', async ({ page }) => {
    const apiTab = page.locator('button[role="tab"]').filter({ hasText: /API/i })
    await apiTab.click()

    // Wait for provider cards to load
    const tabContent = page.locator('[role="tabpanel"]')
    const modelSelect = tabContent.locator('button[role="combobox"]').first()
    await expect(modelSelect).toBeVisible({ timeout: 20000 })

    await modelSelect.click()
    await page.waitForTimeout(500)

    // Dropdown options should appear
    const options = page.locator('[role="option"]')
    expect(await options.count()).toBeGreaterThan(0)

    // Close by pressing Escape
    await page.keyboard.press('Escape')
  })

  test('tab switching between CLI and API works', async ({ page }) => {
    const cliTab = page.locator('button[role="tab"]').filter({ hasText: /CLI/i })
    const apiTab = page.locator('button[role="tab"]').filter({ hasText: /API/i })

    // Start with CLI tab
    await cliTab.click()
    let tabContent = page.locator('[role="tabpanel"]')
    await expect(tabContent.getByText('Claude Code CLI')).toBeVisible({ timeout: 10000 })

    // Switch to API tab and wait for cards to load
    await apiTab.click()
    tabContent = page.locator('[role="tabpanel"]')
    await expect(tabContent.locator('button[role="combobox"]').first()).toBeVisible({ timeout: 20000 })

    // Switch back to CLI tab
    await cliTab.click()
    tabContent = page.locator('[role="tabpanel"]')
    await expect(tabContent.getByText('Claude Code CLI')).toBeVisible({ timeout: 10000 })

    await page.screenshot({ path: 'test-results/llm-tab-switching.png', fullPage: true })
  })

  test('CLI tab: CLI tools are displayed', async ({ page }) => {
    const cliTab = page.locator('button[role="tab"]').filter({ hasText: /CLI/i })
    await cliTab.click()

    const tabContent = page.locator('[role="tabpanel"]')
    await expect(tabContent.getByText('Claude Code CLI')).toBeVisible({ timeout: 10000 })

    // Auth badge should be visible
    const badgeTexts = tabContent.getByText(/^Connected$|^Not Connected$|^연결됨$|^연결 안됨$|^Checking\.\.\.$|^확인 중\.\.\.$|^Not available$|^사용 불가$/i)
    expect(await badgeTexts.count()).toBeGreaterThan(0)

    await page.screenshot({ path: 'test-results/llm-cli-tools.png', fullPage: true })
  })
})
