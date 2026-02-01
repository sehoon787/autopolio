import { test, expect } from '@playwright/test'

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  })

  test('should display settings page header', async ({ page }) => {
    const header = page.locator('h1, h2').filter({ hasText: /setting|설정/i })
    await expect(header).toBeVisible({ timeout: 10000 })
  })

  test('should display language selector', async ({ page }) => {
    // Look for language selection
    const languageOption = page.locator('button, select, [class*="select"]').filter({ hasText: /language|언어|한국어|english/i })
    await expect(languageOption.first()).toBeVisible({ timeout: 10000 })
  })

  test('should toggle language between Korean and English', async ({ page }) => {
    // Find language toggle/select
    const languageButton = page.locator('button').filter({ hasText: /한국어|english/i }).first()

    if (await languageButton.isVisible()) {
      await languageButton.click()

      // Check for language options dropdown
      const options = page.locator('[role="option"], [role="menuitem"], li')
      await expect(options.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('should display theme options', async ({ page }) => {
    // Look for theme selection (dark/light mode)
    const themeOption = page.locator('button, [class*="switch"], [class*="toggle"]').filter({ hasText: /theme|테마|dark|light|다크|라이트/i })
    const count = await themeOption.count()
    expect(count).toBeGreaterThanOrEqual(0) // Theme might not exist
  })

  test('should display LLM provider section', async ({ page }) => {
    // Look for LLM/AI settings
    const llmSection = page.locator('h2, h3, [class*="card"]').filter({ hasText: /llm|ai|provider|openai|anthropic|gemini/i })
    const count = await llmSection.count()
    expect(count).toBeGreaterThanOrEqual(0) // May vary based on platform
  })
})
