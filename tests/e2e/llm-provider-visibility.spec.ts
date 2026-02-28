import { test, expect } from '@playwright/test'

test.describe('LLM Provider Visibility (Web Mode)', () => {
  test('only env_configured providers are visible in API tab', async ({ page }) => {
    await page.goto('http://localhost:3035/settings')
    await page.waitForLoadState('networkidle')

    // Click API tab
    const apiTab = page.locator('button:has-text("API")')
    await apiTab.click()
    await page.waitForTimeout(1000)

    // Verify config API — only Gemini has env_configured=true
    const configResponse = await page.evaluate(async () => {
      const res = await fetch('/api/llm/config')
      return res.json()
    })

    const envConfigured = configResponse.providers.filter((p: { env_configured: boolean }) => p.env_configured)
    const notConfigured = configResponse.providers.filter((p: { env_configured: boolean }) => !p.env_configured)
    console.log(`env_configured: ${envConfigured.map((p: { id: string }) => p.id).join(', ')}`)
    console.log(`not configured: ${notConfigured.map((p: { id: string }) => p.id).join(', ')}`)

    expect(envConfigured).toHaveLength(1)
    expect(envConfigured[0].id).toBe('gemini')

    // In the API tab content area, check provider cards
    const apiTabContent = page.locator('[role="tabpanel"]')

    // OpenAI and Anthropic should NOT appear in the tab content
    await expect(apiTabContent.getByText('OpenAI', { exact: true })).not.toBeVisible()
    await expect(apiTabContent.getByText('Anthropic', { exact: true })).not.toBeVisible()

    // Google Gemini should appear
    await expect(apiTabContent.getByText('Google Gemini', { exact: true }).first()).toBeVisible()

    await page.screenshot({ path: 'test-results/llm-api-tab-filtered.png', fullPage: true })
  })

  test('CLI tab shows both CLI tools', async ({ page }) => {
    await page.goto('http://localhost:3035/settings')
    await page.waitForLoadState('networkidle')

    // Click CLI tab
    const cliTab = page.locator('button:has-text("CLI")')
    await cliTab.click()
    await page.waitForTimeout(1000)

    const cliTabContent = page.locator('[role="tabpanel"]')

    // Both CLI tools should be visible in the tab content
    await expect(cliTabContent.getByText('Claude Code CLI')).toBeVisible()
    await expect(cliTabContent.getByText('Gemini CLI', { exact: true }).first()).toBeVisible()

    await page.screenshot({ path: 'test-results/llm-cli-tab.png', fullPage: true })
  })
})
