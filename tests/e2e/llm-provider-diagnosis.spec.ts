import { test, expect } from '@playwright/test'

test.describe('LLM Provider Diagnosis', () => {
  test('check provider test results on Settings page', async ({ page }) => {
    await page.goto('http://localhost:3035')
    await page.waitForLoadState('networkidle')

    // Navigate to Settings
    const settingsLink = page.locator('a[href*="settings"], button:has-text("Settings"), [data-testid="settings"]')
    if (await settingsLink.count() > 0) {
      await settingsLink.first().click()
    } else {
      await page.goto('http://localhost:3035/settings')
    }
    await page.waitForLoadState('networkidle')

    // Click API tab
    const apiTab = page.locator('button:has-text("API")')
    if (await apiTab.count() > 0) {
      await apiTab.first().click()
      await page.waitForTimeout(500)
    }

    // Check LLM config API response
    const configResponse = await page.evaluate(async () => {
      const res = await fetch('/api/llm/config')
      return res.json()
    })
    console.log('=== LLM Config ===')
    for (const p of configResponse.providers) {
      console.log(`${p.id}: configured=${p.configured}, env_configured=${p.env_configured}`)
    }

    // Test each provider via API
    for (const provider of ['openai', 'anthropic', 'gemini']) {
      const testResponse = await page.evaluate(async (prov) => {
        const res = await fetch(`/api/llm/test/${prov}?use_env=true`, { method: 'POST' })
        return res.json()
      }, provider)
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
