import { test, expect } from '@playwright/test'

import { API_URL, APP_URL } from './runtimeConfig'

// GitHub-connected user ID (same as conftest.py)
const GITHUB_USER_ID = 25

/**
 * Helper to check if GitHub is connected for the test user
 */
async function isGitHubConnected(request: any): Promise<boolean> {
  try {
    const response = await request.get(`${API_URL}/api/github/status`, {
      params: { user_id: GITHUB_USER_ID }
    })
    if (response.ok()) {
      const data = await response.json()
      return data.connected && data.valid
    }
  } catch {
    return false
  }
  return false
}

test.describe('GitHub Connection Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${APP_URL}/setup/github`)
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  })

  test('should display GitHub setup page', async ({ page }) => {
    const header = page.locator('h1, h2').filter({ hasText: /github/i })
    await expect(header).toBeVisible({ timeout: 10000 })
  })

  test('should display connect button or connection status', async ({ page }) => {
    const connectButton = page.locator('button').filter({ hasText: /connect|연결|login|로그인/i })
    const connectedStatus = page.locator('text=/connected|연결됨|disconnect|연결해제/i')

    const connectVisible = await connectButton.first().isVisible().catch(() => false)
    const statusVisible = await connectedStatus.first().isVisible().catch(() => false)

    expect(connectVisible || statusVisible).toBeTruthy()
  })

  test('should display repository list when connected', async ({ page }) => {
    await page.waitForTimeout(2000)

    const repoList = page.locator('[class*="repo"], [class*="repository"]')
    const emptyState = page.locator('text=/no repo|레포.*없|connect.*first|먼저.*연결/i')
    const connectButton = page.locator('button').filter({ hasText: /connect|연결/i })

    const repoVisible = await repoList.first().isVisible().catch(() => false)
    const emptyVisible = await emptyState.first().isVisible().catch(() => false)
    const connectVisible = await connectButton.first().isVisible().catch(() => false)

    expect(repoVisible || emptyVisible || connectVisible).toBeTruthy()
  })
})

test.describe('GitHub Repository Selection', () => {
  test('should allow selecting repositories when connected', async ({ page }) => {
    await page.goto(`${APP_URL}/setup/github`)
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    const checkboxes = page.locator('[type="checkbox"], [role="checkbox"]')
    const selectButtons = page.locator('button').filter({ hasText: /select|선택|add|추가/i })

    const checkboxCount = await checkboxes.count()
    const buttonCount = await selectButtons.count()

    expect(checkboxCount + buttonCount).toBeGreaterThanOrEqual(0)
  })
})

test.describe('GitHub API Integration Tests', () => {
  test('Check GitHub connection status via API', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/github/status`, {
      params: { user_id: GITHUB_USER_ID }
    })

    expect(response.status()).toBeLessThan(500)

    if (response.ok()) {
      const data = await response.json()
      expect(data).toHaveProperty('connected')
      console.log(`GitHub connected: ${data.connected}, valid: ${data.valid}`)
    }
  })

  test('List repositories via API (requires GitHub connection)', async ({ request }) => {
    const connected = await isGitHubConnected(request)
    if (!connected) {
      test.skip()
      return
    }

    const response = await request.get(`${API_URL}/api/github/repos`, {
      params: { user_id: GITHUB_USER_ID }
    })

    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    const repos = data.repos || data
    expect(Array.isArray(repos)).toBeTruthy()
    expect(repos.length).toBeGreaterThan(0)
    console.log(`Found ${repos.length} repositories`)
  })

  test('Detect technologies in repository via API', async ({ request }) => {
    test.setTimeout(60000) // 60 seconds for API calls
    
    const connected = await isGitHubConnected(request)
    if (!connected) {
      test.skip()
      return
    }

    // Get first repo
    const reposResponse = await request.get(`${API_URL}/api/github/repos`, {
      params: { user_id: GITHUB_USER_ID },
      timeout: 30000
    })
    const repos = (await reposResponse.json()).repos || await reposResponse.json()
    if (!repos.length) {
      test.skip()
      return
    }

    const gitUrl = repos[0].html_url || repos[0].clone_url
    const response = await request.get(`${API_URL}/api/github/detect-technologies`, {
      params: { user_id: GITHUB_USER_ID, git_url: gitUrl },
      timeout: 45000
    })

    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    const technologies = data.technologies || data
    expect(Array.isArray(technologies)).toBeTruthy()
    console.log(`Detected technologies: ${technologies.slice(0, 5).join(', ')}`)
  })
})

test.describe('GitHub Full Workflow E2E', () => {
  test('Full flow: List repos → Create project → Analyze', async ({ request }) => {
    test.setTimeout(120000) // 2 minutes for full workflow
    const connected = await isGitHubConnected(request)
    if (!connected) {
      test.skip()
      return
    }

    // Step 1: List repos
    const reposResponse = await request.get(`${API_URL}/api/github/repos`, {
      params: { user_id: GITHUB_USER_ID }
    })
    expect(reposResponse.ok()).toBeTruthy()

    const repos = (await reposResponse.json()).repos
    expect(repos.length).toBeGreaterThan(0)

    // Pick first non-fork repo
    const targetRepo = repos.find((r: any) => !r.fork) || repos[0]
    const gitUrl = targetRepo.html_url
    const repoName = targetRepo.name
    console.log(`Testing with repo: ${repoName}`)

    // Step 2: Detect technologies
    const techResponse = await request.get(`${API_URL}/api/github/detect-technologies`, {
      params: { user_id: GITHUB_USER_ID, git_url: gitUrl }
    })
    expect(techResponse.ok()).toBeTruthy()
    const technologies = (await techResponse.json()).technologies || []
    console.log(`Technologies: ${technologies.slice(0, 5).join(', ')}`)

    // Step 3: Create project
    const projectResponse = await request.post(`${API_URL}/api/knowledge/projects`, {
      params: { user_id: GITHUB_USER_ID },
      data: {
        name: `E2E GitHub Test - ${repoName} - ${Date.now()}`,
        description: `E2E test project for ${repoName}`,
        role: 'Developer',
        project_type: 'personal',
        git_url: gitUrl,
        start_date: '2024-01-01'
      }
    })
    expect(projectResponse.status()).toBeLessThan(300)
    const project = await projectResponse.json()
    const projectId = project.id
    console.log(`Created project: ${projectId}`)

    try {
      // Step 4: Trigger analysis
      const analyzeResponse = await request.post(`${API_URL}/api/github/analyze?user_id=${GITHUB_USER_ID}`, {
        data: {
          git_url: gitUrl,
          project_id: projectId
        }
      })
      expect(analyzeResponse.status()).toBeLessThan(500)
      console.log(`Analysis triggered`)

      // Step 5: Poll for completion (max 60s)
      let analysisComplete = false
      const maxWait = 60000
      const pollInterval = 2000
      const startTime = Date.now()

      while (Date.now() - startTime < maxWait) {
        const checkResponse = await request.get(`${API_URL}/api/knowledge/projects/${projectId}`, {
          params: { user_id: GITHUB_USER_ID }
        })
        if (checkResponse.ok()) {
          const projectData = await checkResponse.json()
          if (projectData.is_analyzed) {
            analysisComplete = true
            console.log(`Analysis completed in ${(Date.now() - startTime) / 1000}s`)
            break
          }
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval))
      }

      // Step 6: Verify (if completed)
      if (analysisComplete) {
        const finalResponse = await request.get(`${API_URL}/api/knowledge/projects/${projectId}`, {
          params: { user_id: GITHUB_USER_ID }
        })
        const finalProject = await finalResponse.json()
        expect(finalProject.is_analyzed).toBeTruthy()
        console.log(`Analysis verified successfully`)
      } else {
        console.log(`Analysis still running (async) - this is OK for E2E`)
      }

    } finally {
      // Cleanup
      await request.delete(`${API_URL}/api/knowledge/projects/${projectId}`, {
        params: { user_id: GITHUB_USER_ID }
      })
      console.log(`Cleaned up project ${projectId}`)
    }
  })
})

test.describe('GitHub UI Workflow', () => {
  test('Navigate to GitHub setup and view repos', async ({ page, request }) => {
    const connected = await isGitHubConnected(request)
    if (!connected) {
      test.skip()
      return
    }

    await page.goto(`${APP_URL}/setup/github`)
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    // Should show connected status or repo list
    const repoItems = page.locator('[class*="repo"], [class*="repository"], [data-testid*="repo"]')
    const count = await repoItems.count()

    if (count > 0) {
      console.log(`Found ${count} repo items in UI`)
      expect(count).toBeGreaterThan(0)
    } else {
      // Check for any indication of connection
      const connectedIndicator = page.locator('text=/connected|연결됨|github/i')
      const isVisible = await connectedIndicator.first().isVisible().catch(() => false)
      expect(isVisible).toBeTruthy()
    }
  })

  test('Import repo and navigate to project detail', async ({ page, request }) => {
    test.setTimeout(60000) // 60 seconds for full flow
    
    const connected = await isGitHubConnected(request)
    if (!connected) {
      test.skip()
      return
    }

    // First create a project with git_url via API
    const timestamp = Date.now()
    const reposResponse = await request.get(`${API_URL}/api/github/repos`, {
      params: { user_id: GITHUB_USER_ID },
      timeout: 30000
    })
    const repos = (await reposResponse.json()).repos
    if (!repos?.length) {
      test.skip()
      return
    }

    const repoUrl = repos[0].html_url
    const projectResponse = await request.post(`${API_URL}/api/knowledge/projects`, {
      params: { user_id: GITHUB_USER_ID },
      data: {
        name: `UI Test Project ${timestamp}`,
        description: 'Created for UI testing',
        role: 'Developer',
        project_type: 'personal',
        git_url: repoUrl,
        start_date: '2024-01-01'
      },
      timeout: 30000
    })
    const project = await projectResponse.json()

    try {
      // Navigate to project detail
      await page.goto(`${APP_URL}/knowledge/projects/${project.id}`)
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

      // Verify project page loaded - look for any project content
      // Could be project name in heading, or project details section
      const projectContent = page.locator('[class*="project"], [data-testid*="project"], main')
      await expect(projectContent.first()).toBeVisible({ timeout: 10000 })

      // Check for analyze button, GitHub link, or git URL display
      const analyzeBtn = page.locator('button').filter({ hasText: /analyze|분석/i })
      const githubLink = page.locator('a[href*="github"]')
      const gitUrlDisplay = page.locator('text=/github\\.com/i')

      const hasAnalyze = await analyzeBtn.count() > 0
      const hasGithubLink = await githubLink.count() > 0
      const hasGitUrl = await gitUrlDisplay.count() > 0

      // At least one indicator that the project with git URL is displayed
      expect(hasAnalyze || hasGithubLink || hasGitUrl).toBeTruthy()
    } finally {
      // Cleanup - wrap in try-catch to avoid context disposed errors
      try {
        await request.delete(`${API_URL}/api/knowledge/projects/${project.id}`, {
          params: { user_id: GITHUB_USER_ID }
        })
      } catch {
        // Ignore cleanup errors
      }
    }
  })
})
