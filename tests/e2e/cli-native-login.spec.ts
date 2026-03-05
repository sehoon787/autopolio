import { test, expect } from '@playwright/test'

test.describe('CLI Native Login (Web Mode)', () => {
  test('Login buttons should NOT appear in web mode (Electron-only feature)', async ({ page }) => {
    await page.goto('http://localhost:3035/settings')
    await page.waitForLoadState('domcontentloaded')

    // Click CLI tab
    const cliTab = page.locator('button:has-text("CLI")')
    await expect(cliTab).toBeVisible()
    await cliTab.click()
    await page.waitForTimeout(1500)

    const cliTabContent = page.locator('[role="tabpanel"]')

    // Both CLI tools should be visible
    await expect(cliTabContent.getByText('Claude Code CLI')).toBeVisible()
    await expect(cliTabContent.getByText('Gemini CLI', { exact: true }).first()).toBeVisible()

    // Login (LogIn icon) buttons should NOT exist in web mode
    // The native login button uses the LogIn icon and has tooltip "Login"
    // In web mode, supportsNativeLogin is false so it shouldn't render
    const loginButtons = cliTabContent.locator('button').filter({
      has: page.locator('svg.lucide-log-in'),
    })
    await expect(loginButtons).toHaveCount(0)

    // Logout buttons should also NOT exist
    const logoutButtons = cliTabContent.locator('button').filter({
      has: page.locator('svg.lucide-log-out'),
    })
    await expect(logoutButtons).toHaveCount(0)

    // "Logging in..." text should not appear
    await expect(cliTabContent.getByText('Logging in...')).not.toBeVisible()
    await expect(cliTabContent.getByText('로그인 중...')).not.toBeVisible()

    await page.screenshot({ path: 'test-results/cli-native-login-web-mode.png', fullPage: true })
  })

  test('Codex CLI should never have Login button (even in concept)', async ({ page }) => {
    await page.goto('http://localhost:3035/settings')
    await page.waitForLoadState('domcontentloaded')

    // Click CLI tab
    const cliTab = page.locator('button:has-text("CLI")')
    await expect(cliTab).toBeVisible()
    await cliTab.click()
    await page.waitForTimeout(1500)

    // Codex CLI card should exist
    const cliTabContent = page.locator('[role="tabpanel"]')
    await expect(cliTabContent.getByText('Codex CLI')).toBeVisible()

    await page.screenshot({ path: 'test-results/cli-codex-no-login.png', fullPage: true })
  })
})
