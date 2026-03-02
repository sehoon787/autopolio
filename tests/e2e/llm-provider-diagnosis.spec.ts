import { test, expect } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8085/api'

test.describe('LLM Provider Diagnosis', () => {
  test('check provider test results on Settings page', async ({ page }) => {
    await page.goto('http://localhost:3035/settings')
    await page.waitForLoadState('domcontentloaded')

    // Click API tab
    const apiTab = page.locator('button:has-text("API")')
    await expect(apiTab).toBeVisible()
    await apiTab.first().click()
    await page.waitForTimeout(500)

    // Check LLM config API response
    const configResp = await page.request.get(`${API_URL}/llm/config`)
    expect(configResp.ok()).toBeTruthy()
    const configResponse = await configResp.json()

    console.log('=== LLM Config ===')
    for (const p of configResponse.providers) {
      console.log(`${p.id}: configured=${p.configured}, env_configured=${p.env_configured}`)
    }

    // Test each provider via API
    for (const provider of ['openai', 'anthropic', 'gemini']) {
      const testResp = await page.request.post(`${API_URL}/llm/test/${provider}?use_env=true`)
      const testResponse = await testResp.json()
      console.log(`=== ${provider} test: success=${testResponse.success}, response=${testResponse.response?.substring(0, 100)}`)
    }

    // Check visible provider cards
    const providerCards = page.locator('[class*="provider"], [class*="Provider"]')
    const cardCount = await providerCards.count()
    console.log(`=== Visible provider cards: ${cardCount}`)

    // Take screenshot
    await page.screenshot({ path: 'test-results/llm-provider-diagnosis.png', fullPage: true })
  })
})
