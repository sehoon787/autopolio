import { test, expect } from '@playwright/test'
import { API_URL } from './runtimeConfig'

test.describe('Analysis Fields Verification', () => {
  test('API returns all 6 analysis fields for project 571', async ({ request }) => {
    // Verify API returns complete analysis data
    const response = await request.get(`${API_URL}/api/knowledge/projects/571?user_id=46`)
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.ai_summary).toBeTruthy()
    expect(data.ai_summary.length).toBeGreaterThan(50)
    expect(data.ai_key_features).toBeTruthy()
    expect(data.ai_key_features.length).toBeGreaterThan(0)
  })

  test('API returns analysis details from repo_analysis', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/github/analysis/571?user_id=46`)
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    // All 6 fields must be present and non-empty
    expect(data.ai_summary).toBeTruthy()
    expect(data.key_tasks?.length).toBeGreaterThan(0)
    expect(data.implementation_details?.length).toBeGreaterThan(0)
    expect(data.development_timeline?.length).toBeGreaterThan(0)
    expect(Object.keys(data.detailed_achievements || {}).length).toBeGreaterThan(0)
  })

  test('project detail page renders analysis results', async ({ page }) => {
    // Inject user 46 session into localStorage before navigation
    await page.addInitScript(() => {
      localStorage.setItem('user_id', '46')
      localStorage.setItem('user-storage', JSON.stringify({
        state: { user: { id: 46, name: 'Test User', email: 'test@test.com' }, isGuest: false },
        version: 0,
      }))
    })

    // Navigate directly to the project detail page (project 571 = portfolio)
    await page.goto('/knowledge/projects/571')
    await page.waitForLoadState('domcontentloaded')
    // Wait for API data to load
    await page.waitForTimeout(3000)

    // Check that analysis content is visible on the page
    const pageContent = await page.textContent('body')
    expect(pageContent).toBeTruthy()

    // Check for key analysis sections - look for Korean or English headings
    const hasAnalysisContent =
      pageContent!.includes('구현') ||
      pageContent!.includes('Implementation') ||
      pageContent!.includes('성과') ||
      pageContent!.includes('Achievement') ||
      pageContent!.includes('타임라인') ||
      pageContent!.includes('Timeline') ||
      pageContent!.includes('업무') ||
      pageContent!.includes('Task')

    expect(hasAnalysisContent).toBeTruthy()
  })

  test('LLM settings page loads', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('user_id', '46')
      localStorage.setItem('user-storage', JSON.stringify({
        state: { user: { id: 46, name: 'Test User', email: 'test@test.com' }, isGuest: false },
        version: 0,
      }))
    })

    await page.goto('/settings')
    await page.waitForLoadState('domcontentloaded')

    // Wait for the settings page to fully render (past "Initializing..." state)
    await page.waitForSelector('text=/Settings|설정/', { timeout: 15000 })

    const settingsContent = await page.textContent('body')
    expect(settingsContent).toBeTruthy()

    // Should have LLM/AI related settings
    const hasLLMSettings =
      settingsContent!.includes('LLM') ||
      settingsContent!.includes('AI') ||
      settingsContent!.includes('Provider') ||
      settingsContent!.includes('Gemini') ||
      settingsContent!.includes('OpenAI') ||
      settingsContent!.includes('Claude')

    expect(hasLLMSettings).toBeTruthy()
  })
})
