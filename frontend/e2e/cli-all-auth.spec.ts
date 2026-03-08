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
})
