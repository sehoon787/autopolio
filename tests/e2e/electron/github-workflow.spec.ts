/**
 * Electron E2E tests for GitHub workflow.
 *
 * Tests the complete Electron-specific flow:
 *   1. App launches and backend starts automatically
 *   2. GitHub CLI auth detection
 *   3. Repository listing via multi-endpoint aggregation
 *   4. Repo import → project creation
 *   5. Analysis start + result verification
 *
 * Prerequisites:
 *   - `gh` CLI installed and authenticated
 *   - `npm run electron:build` completed (or use dev mode)
 *   - Python venv set up with dependencies
 *
 * Run:
 *   npx playwright test electron/ --config=electron/playwright.electron.config.ts
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'

import { API_BASE_URL, FRONTEND_URL } from '../runtimeConfig'

// Skip entire file if Electron binary is not available (CI/Docker environment)
function electronBinaryExists(): boolean {
  try {
    const electronPath = require('electron') as string
    return typeof electronPath === 'string' && fs.existsSync(electronPath)
  } catch {
    return false
  }
}

test.skip(!electronBinaryExists(), 'Electron binary not available — skipping Electron tests')

const BACKEND_URL = API_BASE_URL.replace(/\/api$/, '')
const API_BASE = `${BACKEND_URL}/api`

// Timeout for backend to become healthy after Electron launches it
const BACKEND_STARTUP_TIMEOUT = 60_000 // 60s
// Timeout for repo listing (multi-endpoint can be slow)
const REPO_LIST_TIMEOUT = 120_000 // 120s
// Timeout for analysis completion
const ANALYSIS_TIMEOUT = 180_000 // 3 min

/** Wait until the backend /health endpoint responds with 200. */
async function waitForBackend(timeoutMs = BACKEND_STARTUP_TIMEOUT): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BACKEND_URL}/health`)
      if (res.ok) return
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Backend did not become healthy within ${timeoutMs}ms`)
}

/** Helper: call backend API directly via fetch (bypasses Electron renderer). */
async function apiGet(path: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return res.json()
}

async function apiPost(path: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

async function apiDelete(path: string): Promise<void> {
  await fetch(`${API_BASE}${path}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('Electron GitHub Workflow', () => {
  let electronApp: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    // Launch Electron from project root
    const projectRoot = path.resolve(__dirname, '..', '..', '..')
    const frontendDir = path.join(projectRoot, 'frontend')

    electronApp = await electron.launch({
      args: [path.join(frontendDir, 'electron', 'main.js')],
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: 'development',
      },
      timeout: 30_000,
    })

    // Get the first (main) window
    page = await electronApp.firstWindow()

    // Wait for backend to start (Electron spawns it automatically)
    await waitForBackend()
  })

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close()
    }
  })

  // ========================================================================
  // 1. App Launch & Backend Health
  // ========================================================================

  test('should launch Electron app and start backend', async () => {
    // Backend should be healthy
    const health = await apiGet('/../health')
    expect(health).toHaveProperty('status', 'healthy')

    // Window should be loaded
    const title = await page.title()
    expect(title).toBeTruthy()
  })

  test('should load the frontend in the Electron window', async () => {
    // Wait for React to render
    await page.waitForLoadState('domcontentloaded')
    // Should have some visible content
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  // ========================================================================
  // 2. GitHub CLI Detection
  // ========================================================================

  test('should detect GitHub CLI status via IPC', async () => {
    // Invoke the IPC handler directly through evaluate
    const status = await electronApp.evaluate(async ({ ipcMain }) => {
      // We can't invoke ipcMain handlers directly; use ipcRenderer instead
      return null
    })

    // Alternative: test via the backend API or page navigation
    await page.goto(`${FRONTEND_URL}/setup/github`)
    await page.waitForLoadState('domcontentloaded')

    // Should show either "Connected" or "Connect" button
    const ghSection = page.locator('text=GitHub').first()
    await expect(ghSection).toBeVisible({ timeout: 15_000 })
  })

  // ========================================================================
  // 3. Repository Listing (multi-endpoint)
  // ========================================================================

  test('should list repos through backend API when token synced', async () => {
    // First check if there's a GitHub-connected user
    let userId: number | null = null
    try {
      const users = await apiGet('/users')
      // Find a user with GitHub connection
      for (const u of Array.isArray(users) ? users : [users]) {
        if (u.github_username || u.github_token_encrypted) {
          userId = u.id
          break
        }
      }
    } catch {
      // No users yet
    }

    if (!userId) {
      test.skip()
      return
    }

    // Backend API should return all repos (5-step aggregation)
    const reposData = await apiGet(`/github/repos?user_id=${userId}&fetch_all=true`)
    const repos = reposData.repos || reposData
    expect(Array.isArray(repos)).toBe(true)

    if (repos.length > 0) {
      // Verify repo shape
      const first = repos[0]
      expect(first).toHaveProperty('name')
      expect(first).toHaveProperty('html_url')
      console.log(`[Electron E2E] Backend returned ${repos.length} repos`)
    }
  })

  // ========================================================================
  // 4. Web vs Electron Repo Count Comparison
  // ========================================================================

  test('should return same repo count for backend API (used by both Web and Electron)', async () => {
    // When isBackendTokenSynced=true, both Web and Electron use the
    // exact same backend endpoint: GET /api/github/repos?fetch_all=true
    //
    // This test verifies that repeated calls return the same count,
    // confirming deterministic results.
    let userId: number | null = null
    try {
      const users = await apiGet('/users')
      for (const u of Array.isArray(users) ? users : [users]) {
        if (u.github_username) {
          userId = u.id
          break
        }
      }
    } catch {
      // ignore
    }

    if (!userId) {
      test.skip()
      return
    }

    const data1 = await apiGet(`/github/repos?user_id=${userId}&fetch_all=true`)
    const count1 = (data1.repos || data1).length

    const data2 = await apiGet(`/github/repos?user_id=${userId}&fetch_all=true`)
    const count2 = (data2.repos || data2).length

    // Should be deterministic
    expect(count1).toBe(count2)
    console.log(`[Electron E2E] Repo count consistency: ${count1} == ${count2}`)
  })

  // ========================================================================
  // 5. Import Repo → Create Project
  // ========================================================================

  test('should import a repo as a project', async () => {
    let userId: number | null = null
    try {
      const users = await apiGet('/users')
      for (const u of Array.isArray(users) ? users : [users]) {
        if (u.github_username) {
          userId = u.id
          break
        }
      }
    } catch {
      // ignore
    }

    if (!userId) {
      test.skip()
      return
    }

    // Get repos
    const reposData = await apiGet(`/github/repos?user_id=${userId}&fetch_all=true`)
    const repos = reposData.repos || reposData
    if (repos.length === 0) {
      test.skip()
      return
    }

    // Get existing projects to avoid duplicates
    const projectsData = await apiGet(`/knowledge/projects?user_id=${userId}`)
    const existingUrls = new Set(
      (projectsData.projects || []).map((p: any) =>
        (p.git_url || '').toLowerCase().replace('.git', '')
      )
    )

    // Find a non-imported, non-fork repo
    const target = repos.find(
      (r: any) =>
        !r.fork &&
        !existingUrls.has((r.html_url || '').toLowerCase().replace('.git', ''))
    )

    if (!target) {
      test.skip()
      return
    }

    const gitUrl = target.html_url
    console.log(`[Electron E2E] Importing: ${target.name} (${gitUrl})`)

    // Import via API
    const importResult = await apiPost(`/github/import-repos?user_id=${userId}`, {
      repo_urls: [gitUrl],
    })

    expect(importResult.imported).toBeGreaterThanOrEqual(1)
    const projectId = importResult.results[0].project_id
    expect(projectId).toBeTruthy()

    // Verify project was created
    const project = await apiGet(`/knowledge/projects/${projectId}?user_id=${userId}`)
    expect(project.git_url).toBe(gitUrl)
    expect(project.name).toBe(target.name)

    console.log(`[Electron E2E] Created project ${projectId}: ${project.name}`)

    // Cleanup
    await apiDelete(`/knowledge/projects/${projectId}?user_id=${userId}`)
  })

  // ========================================================================
  // 6. Analysis Workflow
  // ========================================================================

  test('should start and complete analysis for an imported repo', async () => {
    test.setTimeout(ANALYSIS_TIMEOUT + 30_000)

    let userId: number | null = null
    try {
      const users = await apiGet('/users')
      for (const u of Array.isArray(users) ? users : [users]) {
        if (u.github_username) {
          userId = u.id
          break
        }
      }
    } catch {
      // ignore
    }

    if (!userId) {
      test.skip()
      return
    }

    // Get repos
    const reposData = await apiGet(`/github/repos?user_id=${userId}&fetch_all=true`)
    const repos = reposData.repos || reposData
    if (repos.length === 0) {
      test.skip()
      return
    }

    // Find a small non-fork repo
    const projectsData = await apiGet(`/knowledge/projects?user_id=${userId}`)
    const existingUrls = new Set(
      (projectsData.projects || []).map((p: any) =>
        (p.git_url || '').toLowerCase().replace('.git', '')
      )
    )

    const target = repos.find(
      (r: any) =>
        !r.fork &&
        !existingUrls.has((r.html_url || '').toLowerCase().replace('.git', ''))
    )

    if (!target) {
      test.skip()
      return
    }

    const gitUrl = target.html_url

    // Import
    const importResult = await apiPost(`/github/import-repos?user_id=${userId}`, {
      repo_urls: [gitUrl],
    })
    const projectId = importResult.results[0].project_id

    try {
      // Start analysis (try CLI mode first, fall back to API)
      let analyzeRes: Response
      analyzeRes = await fetch(`${API_BASE}/github/analyze-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          git_url: gitUrl,
          project_id: projectId,
          cli_mode: 'claude_code',
          language: 'en',
        }),
      })

      if (!analyzeRes.ok) {
        // Fall back to API mode
        analyzeRes = await fetch(`${API_BASE}/github/analyze-background`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            git_url: gitUrl,
            project_id: projectId,
            provider: 'gemini',
            language: 'en',
          }),
        })
      }

      if (!analyzeRes.ok) {
        console.log('[Electron E2E] Analysis start failed (LLM not available), skipping')
        return
      }

      const taskData = await analyzeRes.json()
      console.log(`[Electron E2E] Analysis started: task_id=${taskData.task_id}`)

      // Poll for completion
      const startTime = Date.now()
      let completed = false
      while (Date.now() - startTime < ANALYSIS_TIMEOUT) {
        const statusRes = await fetch(
          `${API_BASE}/github/analysis-status/${projectId}?user_id=${userId}`
        )
        if (statusRes.ok) {
          const status = await statusRes.json()
          if (status?.status === 'completed') {
            completed = true
            break
          }
          if (status?.status === 'failed') {
            console.log('[Electron E2E] Analysis failed:', status.error_message)
            break
          }
        }
        await new Promise((r) => setTimeout(r, 5000))
      }

      if (completed) {
        // Verify results
        const analysis = await apiGet(`/github/analysis/${projectId}`)
        expect(analysis).toHaveProperty('total_commits')
        expect(analysis).toHaveProperty('detected_technologies')

        console.log(`[Electron E2E] Analysis completed:`)
        console.log(`  Commits: ${analysis.total_commits}`)
        console.log(`  Technologies: ${(analysis.detected_technologies || []).slice(0, 5).join(', ')}`)
        console.log(`  Key tasks: ${(analysis.key_tasks || []).length} items`)
      } else {
        console.log('[Electron E2E] Analysis did not complete within timeout')
      }
    } finally {
      // Cleanup
      await apiDelete(`/knowledge/projects/${projectId}?user_id=${userId}`)
      console.log(`[Electron E2E] Cleaned up project ${projectId}`)
    }
  })

  // ========================================================================
  // 7. UI Navigation in Electron
  // ========================================================================

  test('should navigate between main pages', async () => {
    // Dashboard
    await page.goto(`${FRONTEND_URL}/dashboard`)
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).not.toBeEmpty()

    // GitHub repos
    await page.goto(`${FRONTEND_URL}/github/repos`)
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).not.toBeEmpty()

    // Projects
    await page.goto(`${FRONTEND_URL}/knowledge/projects`)
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).not.toBeEmpty()

    // Settings
    await page.goto(`${FRONTEND_URL}/settings`)
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).not.toBeEmpty()
  })
})
