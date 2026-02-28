import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3035'

/**
 * Tests for tab count update bug:
 * When adding/deleting an item in a sub-tab, the parent tab count
 * should update immediately without needing to click the tab again.
 */
test.describe('Tab count update after CRUD operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL)
    await page.evaluate(() => {
      localStorage.setItem('user_id', '46')
      localStorage.setItem('user_name', 'sehoon787')
    })
    await page.goto(BASE_URL)
    await page.waitForLoadState('networkidle')
  })

  // Helper: get count from tab text like "Certifications (3)" → 3
  async function getTabCount(page: any, tabNamePattern: RegExp): Promise<number> {
    const tabs = page.locator('[role="tab"]')
    const count = await tabs.count()
    for (let i = 0; i < count; i++) {
      const text = await tabs.nth(i).textContent()
      if (text && tabNamePattern.test(text)) {
        const match = text.match(/\((\d+)\)/)
        return match ? parseInt(match[1]) : 0
      }
    }
    return 0
  }

  test('certifications-awards: add certification updates Certifications tab count', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/certifications-awards`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // Get initial count from "Certifications (N)" sub-tab
    const initialCount = await getTabCount(page, /^Certifications|^자격증/)
    console.log(`Initial certifications count: ${initialCount}`)

    // Click "Add Certification" button
    const addBtn = page.getByRole('button', { name: /^Add$|^추가$|Add First|첫.*추가/ })
    await addBtn.first().click()
    await page.waitForTimeout(500)

    // Fill form
    await page.locator('input[name="name"], input').filter({ hasText: '' }).first().fill('Test Cert for Count')
    // Find the name input in the dialog
    const dialog = page.locator('[role="dialog"]')
    const nameInput = dialog.locator('input').first()
    await nameInput.fill('Test Cert for Count')

    // Submit
    const submitBtn = dialog.getByRole('button', { name: /Save|Add|저장|추가/ })
    await submitBtn.click()
    await page.waitForTimeout(1500)

    // Check count updated WITHOUT clicking tab
    const newCount = await getTabCount(page, /^Certifications|^자격증/)
    console.log(`After add certifications count: ${newCount}`)
    expect(newCount).toBe(initialCount + 1)

    // Cleanup: delete the test cert
    const testCert = page.locator('text=Test Cert for Count')
    if (await testCert.count() > 0) {
      // Find delete button near the test cert
      const card = testCert.locator('..').locator('..').locator('..')
      const deleteBtn = card.locator('button').filter({ has: page.locator('svg') }).last()
      page.on('dialog', dialog => dialog.accept())
      await deleteBtn.click()
      await page.waitForTimeout(1000)
    }
  })

  test('certifications-awards: add award updates Awards tab count', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/certifications-awards`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // Switch to Awards sub-tab
    const awardsTab = page.getByRole('tab', { name: /^Awards|^수상/ })
    await awardsTab.click()
    await page.waitForTimeout(500)

    const initialCount = await getTabCount(page, /^Awards|^수상/)
    console.log(`Initial awards count: ${initialCount}`)

    // Add new award
    const addBtn = page.getByRole('button', { name: /^Add$|^추가$|Add First|첫.*추가/ })
    await addBtn.first().click()
    await page.waitForTimeout(500)

    const dialog = page.locator('[role="dialog"]')
    const nameInput = dialog.locator('input').first()
    await nameInput.fill('Test Award for Count')

    const submitBtn = dialog.getByRole('button', { name: /Save|Add|저장|추가/ })
    await submitBtn.click()
    await page.waitForTimeout(1500)

    const newCount = await getTabCount(page, /^Awards|^수상/)
    console.log(`After add awards count: ${newCount}`)
    expect(newCount).toBe(initialCount + 1)

    // Cleanup
    const testAward = page.locator('text=Test Award for Count')
    if (await testAward.count() > 0) {
      const card = testAward.locator('..').locator('..').locator('..')
      const deleteBtn = card.locator('button').filter({ has: page.locator('svg') }).last()
      page.on('dialog', dialog => dialog.accept())
      await deleteBtn.click()
      await page.waitForTimeout(1000)
    }
  })

  test('education-publications-patents: add training updates Training tab count', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/education-publications-patents`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // Switch to Training sub-tab
    const trainingTab = page.getByRole('tab', { name: /Training|교육/ })
    await trainingTab.click()
    await page.waitForTimeout(500)

    const initialCount = await getTabCount(page, /Training|교육/)
    console.log(`Initial training count: ${initialCount}`)

    // Add new training
    const addBtn = page.getByRole('button', { name: /^Add$|^추가$|Add First|첫.*추가/ })
    await addBtn.first().click()
    await page.waitForTimeout(500)

    const dialog = page.locator('[role="dialog"]')
    // Fill school name
    const schoolInput = dialog.locator('input').first()
    await schoolInput.fill('Test Training for Count')

    // Select degree type as 'course'
    const degreeSelect = dialog.locator('[role="combobox"]').first()
    if (await degreeSelect.count() > 0) {
      await degreeSelect.click()
      await page.waitForTimeout(300)
      const courseOption = page.getByRole('option', { name: /Course|코스|과정/ })
      if (await courseOption.count() > 0) {
        await courseOption.click()
        await page.waitForTimeout(300)
      }
    }

    const submitBtn = dialog.getByRole('button', { name: /Save|Add|저장|추가/ })
    await submitBtn.click()
    await page.waitForTimeout(1500)

    const newCount = await getTabCount(page, /Training|교육/)
    console.log(`After add training count: ${newCount}`)
    expect(newCount).toBe(initialCount + 1)

    // Cleanup
    const testTraining = page.locator('text=Test Training for Count')
    if (await testTraining.count() > 0) {
      const card = testTraining.locator('..').locator('..').locator('..')
      const deleteBtn = card.locator('button').filter({ has: page.locator('svg') }).last()
      page.on('dialog', dialog => dialog.accept())
      await deleteBtn.click()
      await page.waitForTimeout(1000)
    }
  })

  test('activities: add external activity updates External tab count', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/activities`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // Switch to External sub-tab
    const extTab = page.getByRole('tab', { name: /External|대외/ })
    await extTab.click()
    await page.waitForTimeout(500)

    const initialCount = await getTabCount(page, /External|대외/)
    console.log(`Initial external count: ${initialCount}`)

    // Add new external activity
    const addBtn = page.getByRole('button', { name: /^Add$|^추가$|Add First|첫.*추가/ })
    await addBtn.first().click()
    await page.waitForTimeout(500)

    const dialog = page.locator('[role="dialog"]')
    const nameInput = dialog.locator('input').first()
    await nameInput.fill('Test External for Count')

    const submitBtn = dialog.getByRole('button', { name: /Save|Add|저장|추가/ })
    await submitBtn.click()
    await page.waitForTimeout(1500)

    const newCount = await getTabCount(page, /External|대외/)
    console.log(`After add external count: ${newCount}`)
    expect(newCount).toBe(initialCount + 1)

    // Cleanup
    const testItem = page.locator('text=Test External for Count')
    if (await testItem.count() > 0) {
      const card = testItem.locator('..').locator('..').locator('..')
      const deleteBtn = card.locator('button').filter({ has: page.locator('svg') }).last()
      page.on('dialog', dialog => dialog.accept())
      await deleteBtn.click()
      await page.waitForTimeout(1000)
    }
  })

  test('activities: add volunteer activity updates main Activities tab AND Volunteer sub-tab count', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/activities`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // Volunteer tab is default
    const initialVolunteerCount = await getTabCount(page, /Volunteer|봉사/)
    console.log(`Initial volunteer count: ${initialVolunteerCount}`)

    // Add new volunteer activity
    const addBtn = page.getByRole('button', { name: /^Add$|^추가$|Add First|첫.*추가/ })
    await addBtn.first().click()
    await page.waitForTimeout(500)

    const dialog = page.locator('[role="dialog"]')
    const nameInput = dialog.locator('input').first()
    await nameInput.fill('Test Volunteer for Count')

    const submitBtn = dialog.getByRole('button', { name: /Save|Add|저장|추가/ })
    await submitBtn.click()
    await page.waitForTimeout(1500)

    const newVolunteerCount = await getTabCount(page, /Volunteer|봉사/)
    console.log(`After add volunteer count: ${newVolunteerCount}`)
    expect(newVolunteerCount).toBe(initialVolunteerCount + 1)

    // Cleanup
    const testItem = page.locator('text=Test Volunteer for Count')
    if (await testItem.count() > 0) {
      const card = testItem.locator('..').locator('..').locator('..')
      const deleteBtn = card.locator('button').filter({ has: page.locator('svg') }).last()
      page.on('dialog', dialog => dialog.accept())
      await deleteBtn.click()
      await page.waitForTimeout(1000)
    }
  })

  test('education-publications-patents: add publication updates Publications tab count', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/education-publications-patents`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // Switch to Publications sub-tab
    const pubTab = page.getByRole('tab', { name: /Publications|논문/ })
    await pubTab.click()
    await page.waitForTimeout(500)

    const initialCount = await getTabCount(page, /Publications|논문/)
    console.log(`Initial publications count: ${initialCount}`)

    // Add new publication
    const addBtn = page.getByRole('button', { name: /^Add$|^추가$|Add First|첫.*추가/ })
    await addBtn.first().click()
    await page.waitForTimeout(500)

    const dialog = page.locator('[role="dialog"]')
    const titleInput = dialog.locator('input').first()
    await titleInput.fill('Test Publication for Count')

    const submitBtn = dialog.getByRole('button', { name: /Save|Add|저장|추가/ })
    await submitBtn.click()
    await page.waitForTimeout(1500)

    const newCount = await getTabCount(page, /Publications|논문/)
    console.log(`After add publications count: ${newCount}`)
    expect(newCount).toBe(initialCount + 1)

    // Cleanup
    const testItem = page.locator('text=Test Publication for Count')
    if (await testItem.count() > 0) {
      const card = testItem.locator('..').locator('..').locator('..')
      const deleteBtn = card.locator('button').filter({ has: page.locator('svg') }).last()
      page.on('dialog', dialog => dialog.accept())
      await deleteBtn.click()
      await page.waitForTimeout(1000)
    }
  })

  test('education-publications-patents: delete education updates Education tab count', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/education-publications-patents`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    const initialCount = await getTabCount(page, /Education|학력/)
    console.log(`Initial education count: ${initialCount}`)

    if (initialCount === 0) {
      console.log('No education items to delete, skipping')
      test.skip()
      return
    }

    // Delete the first education item
    const deleteBtn = page.locator('[role="tab"][data-state="active"]')
      .locator('..').locator('..').locator('button').filter({ has: page.locator('svg.lucide-trash-2, svg[class*="trash"]') }).first()

    // Alternative: find any delete button on the page
    const allDeleteBtns = page.locator('button:has(svg)').filter({ hasText: '' })

    // Just use the API to create a temp one and then delete via UI
    // First add a temp education
    const addBtn = page.getByRole('button', { name: /^Add$|^추가$|Add First|첫.*추가/ })
    await addBtn.first().click()
    await page.waitForTimeout(500)

    const dialog = page.locator('[role="dialog"]')

    // Select degree (required)
    const degreeSelect = dialog.locator('button[role="combobox"]').first()
    await degreeSelect.click()
    await page.waitForTimeout(300)
    await page.getByRole('option').first().click()
    await page.waitForTimeout(300)

    // Select graduation status (required)
    const statusSelect = dialog.locator('button[role="combobox"]').nth(1)
    await statusSelect.click()
    await page.waitForTimeout(300)
    await page.getByRole('option').first().click()
    await page.waitForTimeout(300)

    // Fill school name
    const schoolInput = dialog.locator('input').first()
    await schoolInput.fill('Temp Edu for Delete Test')

    const submitBtn = dialog.getByRole('button', { name: /Save|Add|저장|추가/ })
    await submitBtn.click()
    await page.waitForTimeout(1500)

    const afterAddCount = await getTabCount(page, /Education|학력/)
    console.log(`After add education count: ${afterAddCount}`)
    expect(afterAddCount).toBe(initialCount + 1)

    // Now delete it
    const testItem = page.locator('text=Temp Edu for Delete Test')
    if (await testItem.count() > 0) {
      const card = testItem.locator('..').locator('..').locator('..')
      const delBtn = card.locator('button').filter({ has: page.locator('svg') }).last()
      page.on('dialog', dialog => dialog.accept())
      await delBtn.click()
      await page.waitForTimeout(1500)

      const afterDeleteCount = await getTabCount(page, /Education|학력/)
      console.log(`After delete education count: ${afterDeleteCount}`)
      expect(afterDeleteCount).toBe(initialCount)
    }
  })
})
