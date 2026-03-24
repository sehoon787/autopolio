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
    const networkRequests: { url: string; status: number; contentType: string; size: number }[] = []
    const failedRequests: { url: string; error: string }[] = []

    // Capture ALL console messages
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`)
    })

    // Capture JS runtime errors
    page.on('pageerror', (error) => {
      pageErrors.push(`${error.name}: ${error.message}`)
    })

    // Intercept network responses — track JS/CSS loading
    page.on('response', (response) => {
      const url = response.url()
      if (url.includes('/assets/') || url.includes('.js') || url.includes('.css')) {
        networkRequests.push({
          url,
          status: response.status(),
          contentType: response.headers()['content-type'] || '(none)',
          size: parseInt(response.headers()['content-length'] || '0', 10),
        })
      }
    })

    // Capture failed requests
    page.on('requestfailed', (request) => {
      failedRequests.push({
        url: request.url(),
        error: request.failure()?.errorText || '(unknown)',
      })
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

    // Dump network requests for assets
    console.log('\n=== NETWORK REQUESTS (assets/js/css) ===')
    if (networkRequests.length === 0) {
      console.log('(NO asset requests captured — JS bundle was never requested!)')
    } else {
      for (const req of networkRequests) {
        console.log(`  ${req.status} ${req.contentType} ${req.url} (${req.size} bytes)`)
      }
    }

    // Dump failed requests
    console.log('\n=== FAILED REQUESTS ===')
    if (failedRequests.length === 0) {
      console.log('(none)')
    } else {
      for (const req of failedRequests) {
        console.log(`  FAIL: ${req.url} — ${req.error}`)
      }
    }

    // Check script tags in served HTML
    const html = await page.content()
    console.log(`\n=== PAGE HTML LENGTH: ${html.length} ===`)

    const scriptTags = html.match(/<script[^>]*>/g) || []
    console.log(`\n=== SCRIPT TAGS FOUND (${scriptTags.length}) ===`)
    for (const tag of scriptTags) {
      console.log(`  ${tag}`)
    }

    // Dump console logs
    console.log('\n=== BROWSER CONSOLE LOGS ===')
    if (consoleLogs.length === 0) {
      console.log('(ZERO console logs — JS never executed)')
    } else {
      for (const log of consoleLogs) {
        console.log(log)
      }
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
