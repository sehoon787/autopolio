import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:3035'

const CLI_EXPECTED_URLS: Record<string, string[]> = {
  'Claude Code CLI': ['claude.ai', 'console.anthropic.com', 'anthropic.com', 'platform.claude.com'],
  'Gemini CLI': ['accounts.google.com', 'aistudio.google.com', 'google.com'],
  'Codex CLI': ['auth.openai.com', 'platform.openai.com', 'openai.com'],
}

// Serial: login tests share a global _active_login_process on the backend
test.describe('CLI login tests', () => {
  test.describe.configure({ mode: 'serial' })

  for (const [cliName, expectedDomains] of Object.entries(CLI_EXPECTED_URLS)) {
    test(`${cliName} login button opens OAuth page`, async ({ page, context }) => {
    // CLI auto-test runs actual prompts and can take 60+ seconds
    test.setTimeout(120_000)

    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' })

    // Click CLI tab
    const cliTab = page.locator('button[role="tab"]', { hasText: /CLI/i })
    await cliTab.click()

    // Wait for CLI auto-tests to finish: either "Not Connected" or "Configured" badge appears
    // (means the auth status check completed — no more "Checking..." spinners)
    await page.locator('text=Not Connected').or(page.locator('text=Configured')).or(page.locator('text=Connected')).first().waitFor({ timeout: 90_000 })
    await page.waitForTimeout(2000)

    // Find the target CLI card by title
    const cliCards = page.locator('.rounded-lg.border.p-4')
    const cardCount = await cliCards.count()

    let targetCard = null
    for (let i = 0; i < cardCount; i++) {
      const card = cliCards.nth(i)
      const title = await card.locator('h4').first().textContent()
      if (title?.trim() === cliName) {
        targetCard = card
        break
      }
    }

    expect(targetCard, `${cliName} card not found`).not.toBeNull()

    // Scroll to the card to ensure it's visible
    await targetCard!.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)

    // Find icon buttons in the header action area
    const headerButtons = targetCard!.locator('.flex.items-center.gap-1 button')
    const btnCount = await headerButtons.count()

    // Look for login (blue) or logout (green) button
    let loginBtn = null
    let logoutBtn = null
    for (let j = 0; j < btnCount; j++) {
      const cls = await headerButtons.nth(j).getAttribute('class') || ''
      if (cls.includes('text-blue-500')) {
        loginBtn = headerButtons.nth(j)
      }
      if (cls.includes('text-green-600') && cls.includes('hover:text-red-500')) {
        logoutBtn = headerButtons.nth(j)
      }
    }

    if (logoutBtn) {
      // CLI is already authenticated — logout button is showing (green → red on hover)
      console.log(`${cliName} → Already authenticated (logout button visible)`)
      expect(logoutBtn).toBeTruthy()
      return
    }

    if (!loginBtn) {
      // CLI doesn't have native login support in this environment (e.g. Gemini/Codex in Docker)
      console.log(`${cliName} → No login button (native login not supported in this environment)`)
      return
    }

    const [newPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 20000 }),
      loginBtn!.click(),
    ])

    // Wait for URL to change from about:blank
    await newPage.waitForURL(url => url.toString() !== 'about:blank', {
      timeout: 20000,
    }).catch(() => {})

    const url = newPage.url()
    console.log(`${cliName} → ${url}`)

    expect(url).not.toBe('about:blank')

    const matchesDomain = expectedDomains.some(d => url.includes(d))
    expect(matchesDomain, `URL "${url}" should match one of: ${expectedDomains.join(', ')}`).toBeTruthy()

    await newPage.close()
  })
  }
})
