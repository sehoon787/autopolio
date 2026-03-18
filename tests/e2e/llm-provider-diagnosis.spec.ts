import { test, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import {
  createApiContext,
  createTestUser,
  loginAsTestUser,
  cleanupTestData,
  TestDataContext,
} from './fixtures/api-helpers'
import { API_BASE_URL } from './runtimeConfig'

const API_URL = API_BASE_URL

test.describe('LLM Provider Diagnosis', () => {
  let testContext: TestDataContext
  let apiRequest: APIRequestContext

  test.beforeAll(async () => {
    try {
      apiRequest = await createApiContext()
      const user = await createTestUser(apiRequest)
      testContext = { user }
    } catch (e) {
      console.log('LLM provider diagnosis test setup failed:', e)
    }
  })

  test.afterAll(async () => {
    await cleanupTestData(apiRequest, testContext)
    await apiRequest.dispose()
  })

  test('check provider test results on Settings page', async ({ page }) => {
    test.setTimeout(60000)
    if (!testContext?.user) {
      test.skip()
      return
    }
    await loginAsTestUser(page, testContext.user)
    await page.goto('/settings?section=llm')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Click API Providers tab
    const apiTab = page.getByRole('tab', { name: /API Providers/i })
    await expect(apiTab).toBeVisible({ timeout: 10000 })
    await apiTab.click()
    await page.waitForTimeout(1000)

    // Check LLM config API response
    const configResp = await apiRequest.get(`${API_URL}/llm/config`, { timeout: 30000 })
    expect(configResp.ok()).toBeTruthy()
    const configResponse = await configResp.json()

    console.log('=== LLM Config ===')
    for (const p of configResponse.providers) {
      console.log(`${p.id}: configured=${p.configured}, env_configured=${p.env_configured}`)
    }

    // Test each provider via API
    for (const provider of ['openai', 'anthropic', 'gemini']) {
      const testResp = await apiRequest.post(`${API_URL}/llm/test/${provider}?use_env=true`, { timeout: 30000 })
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
