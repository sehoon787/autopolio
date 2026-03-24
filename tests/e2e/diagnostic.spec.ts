/**
 * Diagnostic test to identify why the React app doesn't render in CI Docker.
 * Captures console logs, JS errors, and page content.
 */
import { test, expect } from '@playwright/test'
import { FRONTEND_URL } from './runtimeConfig'

test.describe('CI Diagnostic', () => {
  test('capture page state on load', async ({ page }) => {
    const consoleLogs: string[] = []
    const pageErrors: string[] = []

    // Capture ALL console messages
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`)
    })

    // Capture JS runtime errors
    page.on('pageerror', (error) => {
      pageErrors.push(`${error.name}: ${error.message}`)
    })

    // Navigate to frontend
    console.log(`[Diag] Navigating to: ${FRONTEND_URL}`)
    const response = await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
    console.log(`[Diag] Response status: ${response?.status()}`)

    // Wait for network to settle
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
      console.log('[Diag] networkidle timeout after 15s')
    })

    // Wait a bit more for React to hydrate
    await page.waitForTimeout(3000)

    // Dump console logs
    console.log('\n=== BROWSER CONSOLE LOGS ===')
    for (const log of consoleLogs) {
      console.log(log)
    }

    // Dump page errors
    console.log('\n=== PAGE ERRORS ===')
    if (pageErrors.length === 0) {
      console.log('(none)')
    } else {
      for (const err of pageErrors) {
        console.log(err)
      }
    }

    // Check page content
    const html = await page.content()
    console.log(`\n=== PAGE HTML LENGTH: ${html.length} ===`)

    // Check for loading spinner
    const spinner = page.locator('.animate-spin')
    const spinnerVisible = await spinner.isVisible().catch(() => false)
    console.log(`[Diag] Loading spinner visible: ${spinnerVisible}`)

    // Check for nav element
    const nav = page.locator('nav').first()
    const navVisible = await nav.isVisible().catch(() => false)
    console.log(`[Diag] Nav visible: ${navVisible}`)

    // Check for #root content
    const rootEl = page.locator('#root')
    const rootInnerHTML = await rootEl.innerHTML().catch(() => '(failed to get innerHTML)')
    console.log(`\n=== #root innerHTML (first 2000 chars) ===`)
    console.log(rootInnerHTML.substring(0, 2000))

    // Check for any visible text
    const bodyText = await page.locator('body').innerText().catch(() => '(no text)')
    console.log(`\n=== Body text ===`)
    console.log(bodyText.substring(0, 500))

    // Take screenshot
    await page.screenshot({ path: 'test-results/diagnostic-screenshot.png', fullPage: true })
    console.log('[Diag] Screenshot saved')

    // The test passes as long as it completes — we just want the output
    expect(true).toBe(true)
  })

  test('capture page state as guest (no login)', async ({ page }) => {
    const pageErrors: string[] = []

    page.on('pageerror', (error) => {
      pageErrors.push(`${error.name}: ${error.message}`)
    })

    // Clear localStorage to ensure guest mode
    await page.addInitScript(() => {
      localStorage.clear()
    })

    console.log(`[Diag-Guest] Navigating to: ${FRONTEND_URL}`)
    await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
      console.log('[Diag-Guest] networkidle timeout after 15s')
    })
    await page.waitForTimeout(3000)

    if (pageErrors.length > 0) {
      console.log('\n=== GUEST MODE PAGE ERRORS ===')
      for (const err of pageErrors) {
        console.log(err)
      }
    }

    const spinnerVisible = await page.locator('.animate-spin').isVisible().catch(() => false)
    const navVisible = await page.locator('nav').first().isVisible().catch(() => false)
    console.log(`[Diag-Guest] Spinner: ${spinnerVisible}, Nav: ${navVisible}`)

    const rootHTML = await page.locator('#root').innerHTML().catch(() => '(empty)')
    console.log(`[Diag-Guest] #root (first 1000): ${rootHTML.substring(0, 1000)}`)

    await page.screenshot({ path: 'test-results/diagnostic-guest-screenshot.png', fullPage: true })

    expect(true).toBe(true)
  })
})
