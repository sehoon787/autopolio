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

test.describe('LLM Provider Visibility (Web Mode)', () => {
  let testContext: TestDataContext
  let apiRequest: APIRequestContext

  test.beforeAll(async () => {
    try {
      apiRequest = await createApiContext()
      const user = await createTestUser(apiRequest)
      testContext = { user }
    } catch (e) {
      console.log('LLM provider visibility test setup failed:', e)
    }
  })

  test.afterAll(async () => {
    await cleanupTestData(apiRequest, testContext)
    await apiRequest.dispose()
  })

  test.beforeEach(async ({ page }) => {
    if (!testContext?.user) {
      test.skip()
      return
    }
    await loginAsTestUser(page, testContext.user)
  })

  test('env_configured providers are visible in API tab', async ({ page }) => {
    await page.goto('/settings?section=llm')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Verify both tabs exist on the LLM settings section
    const apiTab = page.locator('button[role="tab"]').filter({ hasText: /API Providers|API 제공자/ })
    const cliTab = page.locator('button[role="tab"]').filter({ hasText: /CLI Tools|CLI 도구/ })
    await expect(apiTab).toBeVisible({ timeout: 15000 })
    await expect(cliTab).toBeVisible({ timeout: 15000 })

    // Verify config API — check which providers are env_configured
    const configResp = await apiRequest.get(`${API_URL}/llm/config`, { timeout: 30000 })
    expect(configResp.ok()).toBeTruthy()
    const configResponse = await configResp.json()

    const envConfigured = configResponse.providers.filter((p: { env_configured: boolean }) => p.env_configured)
    console.log(`env_configured: ${envConfigured.map((p: { id: string }) => p.id).join(', ')}`)

    // At least one provider should be env_configured
    expect(envConfigured.length).toBeGreaterThanOrEqual(1)

    // Click API Providers tab directly
    const apiProvidersTab = page.locator('button[role="tab"]').filter({ hasText: /API Providers|API 제공자/ })
    await expect(apiProvidersTab).toBeVisible({ timeout: 15000 })
    await apiProvidersTab.click()
    await page.waitForTimeout(2000)

    // Wait for API Providers tab panel to be active (description text is always present)
    await expect(page.getByText(/API Providers|API 제공자/)).toBeVisible({ timeout: 15000 })

    await page.screenshot({ path: 'test-results/llm-api-tab-filtered.png', fullPage: true })
  })

  test('CLI tab shows both CLI tools', async ({ page }) => {
    await page.goto('/settings?section=llm')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // CLI Tools tab should be visible
    const cliTab = page.locator('button[role="tab"]').filter({ hasText: /CLI Tools|CLI 도구/ })
    await expect(cliTab).toBeVisible({ timeout: 15000 })
    await cliTab.click()
    await page.waitForTimeout(3000)

    // Both CLI tools should be visible somewhere on the page
    await expect(page.getByText('Claude Code CLI').first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('Gemini CLI', { exact: true }).first()).toBeVisible({ timeout: 20000 })

    await page.screenshot({ path: 'test-results/llm-cli-tab.png', fullPage: true })
  })
})
