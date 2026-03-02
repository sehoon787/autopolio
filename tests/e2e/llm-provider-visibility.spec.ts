import { test, expect } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8085/api'

test.describe('LLM Provider Visibility (Web Mode)', () => {
  test('env_configured providers are visible in API tab', async ({ page }) => {
    await page.goto('http://localhost:3035/settings')
    await page.waitForLoadState('domcontentloaded')

    // Click API tab
    const apiTab = page.locator('button:has-text("API")')
    await expect(apiTab).toBeVisible()
    await apiTab.click()
    await page.waitForTimeout(1000)

    // Verify config API — check which providers are env_configured
    const configResp = await page.request.get(`${API_URL}/llm/config`)
    expect(configResp.ok()).toBeTruthy()
    const configResponse = await configResp.json()

    const envConfigured = configResponse.providers.filter((p: { env_configured: boolean }) => p.env_configured)
    console.log(`env_configured: ${envConfigured.map((p: { id: string }) => p.id).join(', ')}`)

    // At least one provider should be env_configured
    expect(envConfigured.length).toBeGreaterThanOrEqual(1)

    // In the API tab content area, check provider cards
    const apiTabContent = page.locator('[role="tabpanel"]')

    // Each env_configured provider should appear in the tab content
    for (const provider of envConfigured) {
      const name = provider.name as string
      await expect(apiTabContent.getByText(name, { exact: true }).first()).toBeVisible()
    }

    await page.screenshot({ path: 'test-results/llm-api-tab-filtered.png', fullPage: true })
  })

  test('CLI tab shows both CLI tools', async ({ page }) => {
    await page.goto('http://localhost:3035/settings')
    await page.waitForLoadState('domcontentloaded')

    // Click CLI tab
    const cliTab = page.locator('button:has-text("CLI")')
    await expect(cliTab).toBeVisible()
    await cliTab.click()
    await page.waitForTimeout(1000)

    const cliTabContent = page.locator('[role="tabpanel"]')

    // Both CLI tools should be visible in the tab content
    await expect(cliTabContent.getByText('Claude Code CLI')).toBeVisible()
    await expect(cliTabContent.getByText('Gemini CLI', { exact: true }).first()).toBeVisible()

    await page.screenshot({ path: 'test-results/llm-cli-tab.png', fullPage: true })
  })
})
