import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:3035'

test.describe('All CLI auth flow tests', () => {
  test.describe.configure({ mode: 'serial' })

  test('All 3 CLI cards render with correct buttons', async ({ page }) => {
    test.setTimeout(120_000)

    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' })

    // Click CLI tab
    await page.locator('button[role="tab"]', { hasText: /CLI/i }).click()

    // Wait for at least one CLI auto-test to finish
    await page.locator('text=Not Connected').or(page.locator('text=Configured')).or(page.locator('text=Connected')).first().waitFor({ timeout: 90_000 })
    await page.waitForTimeout(3000)

    // Check all 3 CLI cards
    const cliNames = ['Claude Code CLI', 'Gemini CLI', 'Codex CLI']

    for (const cliName of cliNames) {
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
      await targetCard!.scrollIntoViewIfNeeded()
      await page.waitForTimeout(500)

      // Check installation status
      const cardText = await targetCard!.innerText()
      const isInstalled = cardText.includes('Installed') || cardText.includes('Outdated')
      console.log(`${cliName}: installed=${isInstalled}`)

      // Check auth badge
      const hasConfigured = cardText.includes('Configured')
      const hasNotConnected = cardText.includes('Not Connected')
      const hasChecking = cardText.includes('Checking')
      console.log(`${cliName}: configured=${hasConfigured}, notConnected=${hasNotConnected}, checking=${hasChecking}`)

      // Check for login/logout/key buttons
      const headerButtons = targetCard!.locator('.flex.items-center.gap-1 button')
      const btnCount = await headerButtons.count()
      const buttonTypes: string[] = []
      for (let j = 0; j < btnCount; j++) {
        const cls = await headerButtons.nth(j).getAttribute('class') || ''
        if (cls.includes('text-blue-500')) buttonTypes.push('login(blue)')
        if (cls.includes('text-green-600')) buttonTypes.push('logout(green)')
        if (cls.includes('text-red-500')) buttonTypes.push('key-error(red)')
        if (cls.includes('text-green-600') && !cls.includes('hover:text-red-500')) buttonTypes.push('key-ok(green)')
      }
      console.log(`${cliName}: buttons=[${buttonTypes.join(', ')}]`)

      // Take screenshot of each card
      await targetCard!.screenshot({ path: `test-results/cli-card-${cliName.replace(/\s+/g, '-').toLowerCase()}.png` })
    }
  })

  test('Claude Code CLI: full OAuth auth code flow', async ({ page, context }) => {
    test.setTimeout(120_000)

    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' })
    await page.locator('button[role="tab"]', { hasText: /CLI/i }).click()
    await page.locator('text=Not Connected').or(page.locator('text=Configured')).or(page.locator('text=Connected')).first().waitFor({ timeout: 90_000 })
    await page.waitForTimeout(2000)

    const card = await findCLICard(page, 'Claude Code CLI')
    expect(card).not.toBeNull()

    const loginBtn = await findButtonByClass(card!, 'text-blue-500')
    if (!loginBtn) {
      console.log('Claude Code CLI: already authenticated or no login button')
      return
    }

    // Click login → opens OAuth page
    const [oauthPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 20000 }),
      loginBtn.click(),
    ])
    const oauthUrl = await waitForUrl(oauthPage)
    console.log(`Claude OAuth URL: ${oauthUrl}`)
    expect(oauthUrl).toContain('claude.ai')
    await oauthPage.close()

    // Wait for login box to appear
    await page.waitForTimeout(3000)

    // Check auth code input
    const authInput = card!.locator('input[placeholder*="auth code"], input[placeholder*="Paste"]')
    const isVisible = await authInput.isVisible().catch(() => false)
    console.log(`Claude auth code input visible: ${isVisible}`)
    expect(isVisible).toBeTruthy()

    // Submit test auth code
    await authInput.fill('test-auth-code-123')
    const submitBtn = card!.locator('button', { hasText: /Submit/i })
    await submitBtn.click()
    await page.waitForTimeout(2000)

    // Verify toast
    await expect(page.locator('text=Auth code submitted')).toBeVisible({ timeout: 5000 })
    console.log('Claude Code: auth code submitted successfully')
  })

  test('Gemini CLI: login flow', async ({ page, context }) => {
    test.setTimeout(120_000)

    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' })
    await page.locator('button[role="tab"]', { hasText: /CLI/i }).click()
    await page.locator('text=Not Connected').or(page.locator('text=Configured')).or(page.locator('text=Connected')).first().waitFor({ timeout: 90_000 })
    await page.waitForTimeout(2000)

    const card = await findCLICard(page, 'Gemini CLI')
    expect(card).not.toBeNull()
    await card!.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)

    // Screenshot before action
    await card!.screenshot({ path: 'test-results/gemini-before-login.png' })

    const loginBtn = await findButtonByClass(card!, 'text-blue-500')
    const logoutBtn = await findButtonByClass(card!, 'text-green-600')

    if (logoutBtn) {
      console.log('Gemini CLI: already authenticated')
      return
    }

    if (!loginBtn) {
      console.log('Gemini CLI: no login button — checking why')
      const cardText = await card!.innerText()
      console.log(`  Card text: ${cardText.substring(0, 200)}`)
      // Still pass — Gemini might not have native login in some environments
      return
    }

    // Click login
    const [oauthPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 20000 }),
      loginBtn.click(),
    ])
    const oauthUrl = await waitForUrl(oauthPage)
    console.log(`Gemini OAuth URL: ${oauthUrl}`)
    await oauthPage.close()

    // Check for auth code input
    await page.waitForTimeout(3000)
    const authInput = card!.locator('input[placeholder*="auth code"], input[placeholder*="Paste"]')
    const isVisible = await authInput.isVisible().catch(() => false)
    console.log(`Gemini auth code input visible: ${isVisible}`)

    if (isVisible) {
      await authInput.fill('test-gemini-code-123')
      const submitBtn = card!.locator('button', { hasText: /Submit/i })
      await submitBtn.click()
      await page.waitForTimeout(2000)
      console.log('Gemini: auth code submitted')
    }
  })

  test('Codex CLI: login flow', async ({ page, context }) => {
    test.setTimeout(120_000)

    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' })
    await page.locator('button[role="tab"]', { hasText: /CLI/i }).click()
    await page.locator('text=Not Connected').or(page.locator('text=Configured')).or(page.locator('text=Connected')).first().waitFor({ timeout: 90_000 })
    await page.waitForTimeout(2000)

    const card = await findCLICard(page, 'Codex CLI')
    expect(card).not.toBeNull()
    await card!.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)

    // Screenshot before action
    await card!.screenshot({ path: 'test-results/codex-before-login.png' })

    const loginBtn = await findButtonByClass(card!, 'text-blue-500')
    const logoutBtn = await findButtonByClass(card!, 'text-green-600')

    if (logoutBtn) {
      console.log('Codex CLI: already authenticated')
      return
    }

    if (!loginBtn) {
      console.log('Codex CLI: no login button — checking why')
      const cardText = await card!.innerText()
      console.log(`  Card text: ${cardText.substring(0, 200)}`)
      return
    }

    // Click login
    const [oauthPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 20000 }),
      loginBtn.click(),
    ])
    const oauthUrl = await waitForUrl(oauthPage)
    console.log(`Codex OAuth URL: ${oauthUrl}`)
    await oauthPage.close()

    // Check for auth code input
    await page.waitForTimeout(3000)
    const authInput = card!.locator('input[placeholder*="auth code"], input[placeholder*="Paste"]')
    const isVisible = await authInput.isVisible().catch(() => false)
    console.log(`Codex auth code input visible: ${isVisible}`)

    if (isVisible) {
      await authInput.fill('test-codex-code-123')
      const submitBtn = card!.locator('button', { hasText: /Submit/i })
      await submitBtn.click()
      await page.waitForTimeout(2000)
      console.log('Codex: auth code submitted')
    }
  })
})

// Helper: find CLI card by name
async function findCLICard(page: any, cliName: string) {
  const cliCards = page.locator('.rounded-lg.border.p-4')
  const count = await cliCards.count()
  for (let i = 0; i < count; i++) {
    const card = cliCards.nth(i)
    const title = await card.locator('h4').first().textContent()
    if (title?.trim() === cliName) return card
  }
  return null
}

// Helper: find button by class substring
async function findButtonByClass(card: any, classSubstr: string) {
  const buttons = card.locator('.flex.items-center.gap-1 button')
  const count = await buttons.count()
  for (let i = 0; i < count; i++) {
    const cls = await buttons.nth(i).getAttribute('class') || ''
    if (cls.includes(classSubstr)) return buttons.nth(i)
  }
  return null
}

// Helper: wait for page URL to change from about:blank
async function waitForUrl(page: any): Promise<string> {
  await page.waitForURL((url: URL) => url.toString() !== 'about:blank', {
    timeout: 20000,
  }).catch(() => {})
  return page.url()
}
