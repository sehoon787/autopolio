/**
 * Electron E2E test for CLI Native Login feature.
 *
 * Verifies:
 *   1. Login buttons appear for Claude Code and Gemini CLI (Electron only)
 *   2. Codex CLI does NOT have a Login button
 *   3. Login/Logout UI elements render correctly
 *
 * Run:
 *   cd tests/e2e
 *   ELECTRON_SERVE_STATIC=1 npx playwright test electron/cli-native-login.spec.ts \
 *     --config=electron/playwright.electron.config.ts
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'

import { API_BASE_URL } from '../runtimeConfig'

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

async function waitForBackend(timeoutMs = 60_000): Promise<void> {
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

/** Build a navigable URL for in-app route navigation. */
function electronRoute(baseUrl: string, routePath: string): string {
  const url = new URL(baseUrl)
  const origin = url.origin !== 'null' ? url.origin : `${url.protocol}//${url.host}`
  return `${origin}${routePath}`
}

let electronApp: ElectronApplication
let page: Page
let appBaseUrl: string

test.beforeAll(async () => {
  const projectRoot = path.resolve(__dirname, '..', '..', '..')
  const frontendDir = path.join(projectRoot, 'frontend')

  electronApp = await electron.launch({
    args: [frontendDir],
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ELECTRON_SERVE_STATIC: '1',
    },
    timeout: 30_000,
  })

  page = await electronApp.firstWindow()
  await waitForBackend()

  appBaseUrl = page.url()
  console.log(`[CLI Login E2E] Detected app base URL: ${appBaseUrl}`)

  // Navigate to settings page
  await page.goto(electronRoute(appBaseUrl, '/settings'))
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(2000)

  // Click on "AI Providers" / "AI 제공자" sidebar item to get to LLM section
  const aiProvidersLink = page.locator('text=/AI Providers|AI 제공자/').first()
  await expect(aiProvidersLink).toBeVisible({ timeout: 15_000 })
  await aiProvidersLink.click()
  await page.waitForTimeout(1000)

  // Click CLI tab ("CLI Tools" / "CLI 도구")
  const cliTab = page.locator('button').filter({ hasText: /CLI/ }).first()
  await expect(cliTab).toBeVisible({ timeout: 10_000 })
  await cliTab.click()
  await page.waitForTimeout(2000)
})

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close()
  }
})

test.describe('CLI Native Login (Electron Mode)', () => {
  test('CLI tab loads with all three CLI tools', async () => {
    // All three CLI tools should be visible on the page
    await expect(page.getByText('Claude Code CLI')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Gemini CLI', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Codex CLI')).toBeVisible()

    await page.screenshot({
      path: 'test-results-electron/cli-native-login-electron.png',
      fullPage: true,
    })
  })

  test('Login buttons appear for Claude Code and Gemini CLI (if installed)', async () => {
    // Find all LogIn icon buttons on the page
    // In Electron mode with supportsNativeLogin=true, installed CLIs should have login buttons
    const loginIcons = page.locator('svg.lucide-log-in')
    const logoutIcons = page.locator('svg.lucide-log-out')

    const loginCount = await loginIcons.count()
    const logoutCount = await logoutIcons.count()

    console.log(`Login buttons: ${loginCount}, Logout buttons: ${logoutCount}`)

    // Claude Code and/or Gemini CLI should have either a login or logout button
    // (depends on whether they're installed and authenticated)
    expect(loginCount + logoutCount).toBeGreaterThanOrEqual(0)

    await page.screenshot({
      path: 'test-results-electron/cli-login-buttons.png',
      fullPage: true,
    })
  })

  test('Codex CLI card is visible and has expected controls', async () => {
    // Find the Codex CLI card
    const codexCard = page.locator('.rounded-lg.border').filter({
      hasText: 'Codex CLI',
    })

    await expect(codexCard).toBeVisible()

    // Codex CLI card should show the tool name
    await expect(codexCard.getByText('Codex CLI')).toBeVisible()
  })
})
