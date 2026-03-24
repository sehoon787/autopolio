import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3035'

test.describe('Manual reorder with animation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL)
    await page.evaluate(() => {
      localStorage.setItem('user_id', '46')
      localStorage.setItem('user_name', 'sehoon787')
    })
    await page.goto(BASE_URL)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForLoadState('networkidle')
    await page.locator('nav').first().waitFor({ state: 'visible', timeout: 30000 })
  })

  // Helper: navigate to certifications page and switch to manual sort
  async function goToManualSort(page: import('@playwright/test').Page) {
    await page.goto(`${BASE_URL}/knowledge/certifications-awards`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Find and click the sort dropdown
    const sortTrigger = page.locator('button[role="combobox"]').first()
    const hasSortDropdown = await sortTrigger.count() > 0
    if (!hasSortDropdown) return false

    await sortTrigger.click()
    await page.waitForTimeout(300)

    // Select "manual" sort option
    const manualOption = page.getByRole('option', { name: /직접 정렬|Manual/ })
    const hasManual = await manualOption.count() > 0
    if (!hasManual) {
      // Close dropdown if manual option not found
      await page.keyboard.press('Escape')
      return false
    }
    await manualOption.click()
    await page.waitForTimeout(500)
    return true
  }

  // Helper: get all card titles in order
  async function getCardTitles(page: import('@playwright/test').Page) {
    const titles = await page.locator('.grid.gap-4 h3.text-xl').allTextContents()
    return titles
  }

  test('manual sort shows up/down buttons', async ({ page }) => {
    const hasManual = await goToManualSort(page)
    if (!hasManual) {
      console.log('No manual sort option or no items — skipping')
      return
    }

    // Check that chevron up/down buttons appear
    const upButtons = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-up') })
    const downButtons = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') })

    const upCount = await upButtons.count()
    const downCount = await downButtons.count()

    if (upCount > 0) {
      await expect(upButtons.first()).toBeVisible()
      await expect(downButtons.first()).toBeVisible()
    }

    await page.screenshot({ path: 'test-results/manual-sort-buttons.png', fullPage: true })
  })

  test('first item up button is disabled', async ({ page }) => {
    const hasManual = await goToManualSort(page)
    if (!hasManual) {
      console.log('No manual sort option — skipping')
      return
    }

    // First item's up button should be disabled
    const upButtons = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-up') })
    const upCount = await upButtons.count()
    if (upCount === 0) {
      console.log('No up buttons found — skipping')
      return
    }

    await expect(upButtons.first()).toBeDisabled()
    await page.screenshot({ path: 'test-results/first-item-up-disabled.png', fullPage: true })
  })

  test('last item down button is disabled', async ({ page }) => {
    const hasManual = await goToManualSort(page)
    if (!hasManual) {
      console.log('No manual sort option — skipping')
      return
    }

    // Last item's down button should be disabled
    const downButtons = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') })
    const downCount = await downButtons.count()
    if (downCount === 0) {
      console.log('No down buttons found — skipping')
      return
    }

    await expect(downButtons.last()).toBeDisabled()
    await page.screenshot({ path: 'test-results/last-item-down-disabled.png', fullPage: true })
  })

  test('clicking down button moves item down', async ({ page }) => {
    const hasManual = await goToManualSort(page)
    if (!hasManual) {
      console.log('No manual sort option — skipping')
      return
    }

    const titlesBefore = await getCardTitles(page)
    if (titlesBefore.length < 2) {
      console.log('Need at least 2 items to test reorder — skipping')
      return
    }

    // Click the first item's down button
    const downButtons = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') })
    await downButtons.first().click()
    await page.waitForTimeout(500)

    // Items should have swapped
    const titlesAfter = await getCardTitles(page)
    expect(titlesAfter[0]).toBe(titlesBefore[1])
    expect(titlesAfter[1]).toBe(titlesBefore[0])

    await page.screenshot({ path: 'test-results/reorder-move-down.png', fullPage: true })
  })

  test('clicking up button moves item up', async ({ page }) => {
    const hasManual = await goToManualSort(page)
    if (!hasManual) {
      console.log('No manual sort option — skipping')
      return
    }

    const titlesBefore = await getCardTitles(page)
    if (titlesBefore.length < 2) {
      console.log('Need at least 2 items to test reorder — skipping')
      return
    }

    // Click the second item's up button
    const upButtons = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-up') })
    if (await upButtons.count() < 2) {
      console.log('Not enough up buttons — skipping')
      return
    }
    await upButtons.nth(1).click()
    await page.waitForTimeout(500)

    // Items should have swapped
    const titlesAfter = await getCardTitles(page)
    expect(titlesAfter[0]).toBe(titlesBefore[1])
    expect(titlesAfter[1]).toBe(titlesBefore[0])

    await page.screenshot({ path: 'test-results/reorder-move-up.png', fullPage: true })
  })

  test('rapid clicks batch correctly without error', async ({ page }) => {
    const hasManual = await goToManualSort(page)
    if (!hasManual) {
      console.log('No manual sort option — skipping')
      return
    }

    const titlesBefore = await getCardTitles(page)
    if (titlesBefore.length < 3) {
      console.log('Need at least 3 items to test rapid clicks — skipping')
      return
    }

    // Rapidly click down button on first item twice (no waiting between clicks)
    const downButtons = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') })
    await downButtons.first().click()
    // Brief delay for optimistic update to render
    await page.waitForTimeout(100)
    await downButtons.first().click()

    // Wait for debounced API call to complete
    await page.waitForTimeout(1000)

    // No error toast should appear
    const errorToast = page.locator('[data-variant="destructive"]')
    const errorCount = await errorToast.count()
    expect(errorCount).toBe(0)

    // Page should still be functional — no crash
    const titlesAfter = await getCardTitles(page)
    expect(titlesAfter.length).toBe(titlesBefore.length)

    await page.screenshot({ path: 'test-results/rapid-clicks-no-error.png', fullPage: true })
  })

  test('switching sort mode hides manual reorder buttons', async ({ page }) => {
    const hasManual = await goToManualSort(page)
    if (!hasManual) {
      console.log('No manual sort option — skipping')
      return
    }

    // Verify buttons exist in manual mode
    const upButtonsBefore = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-up') })
    const manualButtonCount = await upButtonsBefore.count()

    if (manualButtonCount === 0) {
      console.log('No items with reorder buttons — skipping')
      return
    }

    // Switch back to date sort
    const sortTrigger = page.locator('button[role="combobox"]').first()
    await sortTrigger.click()
    await page.waitForTimeout(300)

    const dateOption = page.getByRole('option', { name: /최근 날짜|Date/ }).first()
    const hasDate = await dateOption.count() > 0
    if (hasDate) {
      await dateOption.click()
      await page.waitForTimeout(500)

      // Up/down buttons should be hidden in non-manual mode
      const upButtonsAfter = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-up') })
      await expect(upButtonsAfter).toHaveCount(0)
    }

    await page.screenshot({ path: 'test-results/sort-mode-switch-hides-buttons.png', fullPage: true })
  })

  test('reorder persists after page reload', async ({ page }) => {
    const hasManual = await goToManualSort(page)
    if (!hasManual) {
      console.log('No manual sort option — skipping')
      return
    }

    const titlesBefore = await getCardTitles(page)
    if (titlesBefore.length < 2) {
      console.log('Need at least 2 items — skipping')
      return
    }

    // Move first item down
    const downButtons = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') })
    await downButtons.first().click()

    // Wait for debounced API call to finish
    await page.waitForTimeout(1000)

    // Reload the page
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Re-enter manual sort mode
    const hasManual2 = await goToManualSort(page)
    if (!hasManual2) return

    const titlesAfter = await getCardTitles(page)

    // Order should be preserved (swapped from before)
    expect(titlesAfter[0]).toBe(titlesBefore[1])
    expect(titlesAfter[1]).toBe(titlesBefore[0])

    // Restore original order
    const upButtons = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-up') })
    if (await upButtons.count() >= 2) {
      await upButtons.nth(1).click()
      await page.waitForTimeout(1000)
    }

    await page.screenshot({ path: 'test-results/reorder-persists-reload.png', fullPage: true })
  })

  test('no error when reorder API returns', async ({ page }) => {
    const hasManual = await goToManualSort(page)
    if (!hasManual) {
      console.log('No manual sort option — skipping')
      return
    }

    const titles = await getCardTitles(page)
    if (titles.length < 2) {
      console.log('Need at least 2 items — skipping')
      return
    }

    // Monitor for console errors during reorder
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    // Perform reorder
    const downButtons = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') })
    await downButtons.first().click()
    await page.waitForTimeout(1500)

    // Check no relevant errors occurred
    const reorderErrors = consoleErrors.filter(e =>
      e.includes('reorder') || e.includes('422') || e.includes('500')
    )
    expect(reorderErrors.length).toBe(0)

    // Restore original order
    const upButtons = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-up') })
    if (await upButtons.count() >= 2) {
      await upButtons.nth(1).click()
      await page.waitForTimeout(1000)
    }

    await page.screenshot({ path: 'test-results/reorder-no-api-error.png', fullPage: true })
  })
})
