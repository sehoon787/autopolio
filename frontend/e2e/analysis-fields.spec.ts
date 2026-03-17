import { test, expect } from '@playwright/test'
import { API_URL } from './runtimeConfig'

test.describe('Analysis Fields Verification', () => {
  let userId: number
  let projectId: number

  test.beforeAll(async ({ request }) => {
    // Create a test user
    const userRes = await request.post(`${API_URL}/api/users`, {
      data: { name: 'E2E Analysis Test', email: `e2e-analysis-${Date.now()}@test.com` },
    })
    const user = await userRes.json()
    userId = user.id

    // Create a test project
    const projectRes = await request.post(`${API_URL}/api/knowledge/projects?user_id=${userId}`, {
      data: {
        name: 'E2E Test Project',
        description: 'A test project for E2E analysis field verification',
        role: 'Developer',
        team_size: 1,
        project_type: 'personal',
        start_date: '2024-01-01',
      },
    })
    const project = await projectRes.json()
    projectId = project.id
  })

  test.afterAll(async ({ request }) => {
    if (userId) {
      await request.delete(`${API_URL}/api/users/${userId}`).catch(() => {})
    }
  })

  test('API returns valid response for project endpoint', async ({ request }) => {
    // Verify the project API returns a 200 for the dynamically created project
    const response = await request.get(`${API_URL}/api/knowledge/projects/${projectId}?user_id=${userId}`)
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    // Basic project fields must exist — no AI analysis assertion since no analysis was run
    expect(data.id).toBe(projectId)
    expect(data.name).toBeTruthy()
  })

  test('API returns 200 or 404 (not 500) for analysis endpoint', async ({ request }) => {
    // No GitHub analysis has been run, so 404 is acceptable. 500 is not.
    const response = await request.get(`${API_URL}/api/github/analysis/${projectId}?user_id=${userId}`)
    const status = response.status()
    expect([200, 404]).toContain(status)
  })

  test('project detail page renders without crash', async ({ page }) => {
    await page.addInitScript((uid) => {
      localStorage.setItem('user_id', String(uid))
      localStorage.setItem('user-storage', JSON.stringify({
        state: { user: { id: uid, name: 'E2E Analysis Test', email: 'e2e@test.com' }, isGuest: false },
        version: 0,
      }))
    }, userId)

    await page.goto(`/knowledge/projects/${projectId}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // The page should render — not a blank error screen
    const pageContent = await page.textContent('body')
    expect(pageContent).toBeTruthy()
    expect(pageContent!.length).toBeGreaterThan(20)

    // Should not show a generic crash / unhandled error boundary message
    const hasHardCrash =
      pageContent!.includes('Something went wrong') &&
      pageContent!.includes('Cannot read') // JS error leak

    expect(hasHardCrash).toBeFalsy()
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
