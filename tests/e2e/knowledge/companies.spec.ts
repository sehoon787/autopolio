/**
 * E2E tests for Companies management.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestCompany,
  cleanupTestData,
  createApiContext,
  TestDataContext,
} from '../fixtures/api-helpers'
import { SELECTORS, TEST_COMPANY } from '../fixtures/test-data'

test.describe('Companies CRUD', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      testContext = { user }
    } finally {
      await request.dispose()
    }
  })

  test.afterAll(async () => {
    const request = await createApiContext()
    try {
      await cleanupTestData(request, testContext)
    } finally {
      await request.dispose()
    }
  })

  test('should display companies list page', async ({ page }) => {
    await page.goto('/knowledge/companies')

    // Check page title or header
    await expect(
      page.locator('h1, h2').filter({ hasText: /회사|Companies|경력/i }).first()
    ).toBeVisible()
  })

  test('should create a new company', async ({ page }) => {
    await page.goto('/knowledge/companies')

    // Click add button
    await page.click(SELECTORS.BTN_ADD)

    // Fill form
    await page.fill(SELECTORS.INPUT_NAME, `E2E Company ${Date.now()}`)
    await page.fill(SELECTORS.INPUT_POSITION, TEST_COMPANY.position)

    // Fill department if field exists
    const deptInput = page.locator(SELECTORS.INPUT_DEPARTMENT)
    if (await deptInput.isVisible()) {
      await deptInput.fill(TEST_COMPANY.department)
    }

    // Fill start date
    const startDateInput = page.locator(SELECTORS.INPUT_START_DATE)
    if (await startDateInput.isVisible()) {
      await startDateInput.fill(TEST_COMPANY.start_date)
    }

    // Save
    await page.click(SELECTORS.BTN_SAVE)

    // Verify success - either success message or company appears in list
    await expect(
      page.locator('text=E2E Company').first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should edit an existing company', async ({ page, request }) => {
    // Create company via API first
    const company = await createTestCompany(request, testContext.user!.id)
    testContext.company = company

    await page.goto('/knowledge/companies')

    // Wait for list to load
    await page.waitForLoadState('networkidle')

    // Find and click edit on the company
    const companyRow = page.locator(`text=${company.name}`).first()
    await expect(companyRow).toBeVisible({ timeout: 10000 })

    // Click edit button (may be in row or need to click on row first)
    const editBtn = page.locator(SELECTORS.BTN_EDIT).first()
    if (await editBtn.isVisible()) {
      await editBtn.click()
    } else {
      // Try clicking on the company row to open edit
      await companyRow.click()
    }

    // Update name
    const nameInput = page.locator(SELECTORS.INPUT_NAME)
    await nameInput.clear()
    await nameInput.fill(`Updated Company ${Date.now()}`)

    // Save
    await page.click(SELECTORS.BTN_SAVE)

    // Verify update
    await expect(page.locator('text=Updated Company').first()).toBeVisible({ timeout: 10000 })
  })

  test('should delete a company', async ({ page, request }) => {
    // Create company via API
    const company = await createTestCompany(request, testContext.user!.id, {
      name: `Delete Me Company ${Date.now()}`,
    })

    await page.goto('/knowledge/companies')
    await page.waitForLoadState('networkidle')

    // Find the company
    const companyRow = page.locator(`text=${company.name}`).first()
    await expect(companyRow).toBeVisible({ timeout: 10000 })

    // Click delete button
    const deleteBtn = page.locator(SELECTORS.BTN_DELETE).first()
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click()
    } else {
      // May need to open a menu first
      await companyRow.click()
      await page.click(SELECTORS.BTN_DELETE)
    }

    // Confirm deletion
    const confirmBtn = page.locator(SELECTORS.BTN_CONFIRM)
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click()
    }

    // Verify deleted - company should no longer be visible
    await expect(page.locator(`text=${company.name}`)).not.toBeVisible({ timeout: 10000 })
  })

  test('should show validation error for empty name', async ({ page }) => {
    await page.goto('/knowledge/companies')
    await page.click(SELECTORS.BTN_ADD)

    // Try to save without name
    await page.fill(SELECTORS.INPUT_POSITION, 'Developer')

    // Attempt save
    const saveBtn = page.locator(SELECTORS.BTN_SAVE)
    await saveBtn.click()

    // Should show error or prevent save
    // Check for error message or that modal is still open
    const error = page.locator(SELECTORS.ERROR)
    const modal = page.locator(SELECTORS.MODAL)
    await expect(error.or(modal)).toBeVisible()
  })
})

test.describe('Companies Timeline View', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      const company1 = await createTestCompany(request, user.id, {
        name: 'Timeline Company 1',
        start_date: '2020-01-01',
        end_date: '2022-12-31',
      })
      const company2 = await createTestCompany(request, user.id, {
        name: 'Timeline Company 2',
        start_date: '2023-01-01',
      })
      testContext = { user, company: company2 }
    } finally {
      await request.dispose()
    }
  })

  test.afterAll(async () => {
    const request = await createApiContext()
    try {
      await cleanupTestData(request, testContext)
    } finally {
      await request.dispose()
    }
  })

  test('should display timeline view', async ({ page }) => {
    await page.goto('/knowledge/companies/timeline')

    // Should show timeline or companies organized by time
    await expect(
      page.locator('text=Timeline Company').first()
    ).toBeVisible({ timeout: 10000 })
  })
})
