/**
 * E2E tests for Companies management.
 *
 * Selectors are based on the actual Companies page UI:
 * - Page heading: "Company Management" (h1)
 * - Empty state: "No companies registered" + "Add First Company" button
 * - "Add Company" button in header
 * - Company cards with name (h3), position, date range
 * - Edit/Delete icon buttons (Pencil/Trash2)
 * - Delete uses browser confirm() dialog
 * - "Timeline View" button navigates to /knowledge/companies/timeline
 * - Dialog for add/edit with title "Add New Company" / "Edit Company"
 * - Form fields use id attributes: name, position, department, location,
 *   start_date, end_date, is_current (checkbox), description (textarea)
 * - Dialog footer: Cancel + Add/Edit buttons
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestCompany,
  cleanupTestData,
  createApiContext,
  loginAsTestUser,
  TestDataContext,
} from '../fixtures/api-helpers'
import { TEST_COMPANY } from '../fixtures/test-data'

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

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page, testContext.user!)
  })

  test('should display companies list page', async ({ page }) => {
    await page.goto('/knowledge/companies')
    await page.waitForLoadState('domcontentloaded')

    // Page heading: "Company Management"
    await expect(
      page.getByRole('heading', { name: 'Company Management' })
    ).toBeVisible()
  })

  test('should show empty state when no companies', async ({ page }) => {
    await page.goto('/knowledge/companies')
    await page.waitForLoadState('domcontentloaded')

    // Empty state text
    await expect(page.getByText('No companies registered')).toBeVisible()

    // "Add First Company" button
    await expect(
      page.getByRole('button', { name: 'Add First Company' })
    ).toBeVisible()
  })

  test('should create a new company', async ({ page }) => {
    await page.goto('/knowledge/companies')
    await page.waitForLoadState('domcontentloaded')

    // Click "Add Company" button in header
    await page.getByRole('button', { name: 'Add Company' }).click()

    // Wait for dialog to appear
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Dialog title should be "Add New Company"
    await expect(dialog.getByText('Add New Company')).toBeVisible()

    // Fill form fields by id
    const companyName = `E2E Company ${Date.now()}`
    await dialog.locator('#name').fill(companyName)
    await dialog.locator('#position').fill(TEST_COMPANY.position)
    await dialog.locator('#department').fill(TEST_COMPANY.department)
    await dialog.locator('#start_date').fill(TEST_COMPANY.start_date)

    // Click "Add" button in dialog footer
    await dialog.getByRole('button', { name: 'Add' }).click()

    // Verify company appears in list
    await expect(page.getByText(companyName)).toBeVisible({ timeout: 15000 })
  })

  test('should edit an existing company', async ({ page, request }) => {
    // Create company via API first
    const company = await createTestCompany(request, testContext.user!.id)
    testContext.company = company

    await page.goto('/knowledge/companies')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Wait for company to appear
    await expect(page.getByText(company.name)).toBeVisible({ timeout: 15000 })

    // Find the individual company card (filter by having pencil icon to avoid matching parent container)
    const companyCard = page.locator('[class*="bg-card"]').filter({ hasText: company.name }).filter({ has: page.locator('svg.lucide-pencil') }).first()
    await companyCard.locator('button').filter({ has: page.locator('svg.lucide-pencil') }).click()

    // Wait for edit dialog
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Dialog title should be "Edit Company"
    await expect(dialog.getByText('Edit Company')).toBeVisible()

    // Update the name
    const nameInput = dialog.locator('#name')
    await nameInput.clear()
    const updatedName = `Updated Company ${Date.now()}`
    await nameInput.fill(updatedName)

    // Click "Edit" button in dialog footer
    await dialog.getByRole('button', { name: 'Edit' }).click()

    // Verify update
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 15000 })
  })

  test('should delete a company', async ({ page, request }) => {
    // Create company via API
    const company = await createTestCompany(request, testContext.user!.id, {
      name: `Delete Me Company ${Date.now()}`,
    })

    await page.goto('/knowledge/companies')
    await page.waitForLoadState('domcontentloaded')

    // Wait for company to appear
    await expect(page.getByText(company.name)).toBeVisible({ timeout: 15000 })

    // Set up dialog handler BEFORE clicking delete
    // Company delete uses browser confirm() dialog
    page.on('dialog', (dialog) => dialog.accept())

    // Find the company card and its delete button
    // Use a robust locator: find text, navigate to card ancestor, then find trash button
    const companyCard = page.locator('[class*="bg-card"]').filter({ hasText: company.name }).filter({ has: page.locator('svg.lucide-trash2') }).first()
    await expect(companyCard).toBeVisible({ timeout: 10000 })
    await companyCard.locator('button').filter({ has: page.locator('svg.lucide-trash2') }).click()

    // Verify deleted - company should no longer be visible
    await expect(page.getByText(company.name)).not.toBeVisible({ timeout: 15000 })
  })

  test('should show validation error for empty name', async ({ page }) => {
    await page.goto('/knowledge/companies')
    await page.waitForLoadState('domcontentloaded')

    // Click "Add Company"
    await page.getByRole('button', { name: 'Add Company' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Fill only position, leave name empty
    await dialog.locator('#position').fill('Developer')

    // Click "Add" button - should not close dialog because name is required
    await dialog.getByRole('button', { name: 'Add' }).click()

    // Dialog should still be visible (form validation prevents submission)
    await expect(dialog).toBeVisible()
  })
})

test.describe('Companies Timeline View', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      await createTestCompany(request, user.id, {
        name: 'Timeline Company 1',
        start_date: '2020-01-01',
        end_date: '2022-12-31',
      })
      await createTestCompany(request, user.id, {
        name: 'Timeline Company 2',
        start_date: '2023-01-01',
      })
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

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page, testContext.user!)
  })

  test('should navigate to timeline view', async ({ page }) => {
    await page.goto('/knowledge/companies')
    await page.waitForLoadState('domcontentloaded')

    // Click "Timeline View" button
    await page.getByRole('button', { name: 'Timeline View' }).click()

    // Should navigate to timeline page
    await expect(page).toHaveURL(/\/knowledge\/companies\/timeline/)
  })

  test('should display timeline view with companies', async ({ page }) => {
    await page.goto('/knowledge/companies/timeline')
    await page.waitForLoadState('domcontentloaded')

    // Should show the timeline heading
    await expect(
      page.getByRole('heading', { name: 'Company Timeline' })
    ).toBeVisible()

    // Should show companies
    await expect(page.getByText('Timeline Company 1')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Timeline Company 2')).toBeVisible({ timeout: 15000 })
  })
})
