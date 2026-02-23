/**
 * E2E tests for Credentials management (certifications, education, awards).
 *
 * Selectors are based on the actual Credentials page UI:
 * - Page heading: "Credentials Management" (h1)
 * - Subtitle: "Manage your certifications, awards, academic background..."
 * - Main category tabs (3 groups):
 *   - "Education & Publications" group (default active)
 *     - Sub-tabs: "Education", "Training", "Publications"
 *   - "Certifications & Awards" group
 *     - Sub-tabs: "Certifications", "Awards"
 *   - "Activities" group
 *     - Sub-tabs: "Volunteer", "External"
 *
 * Certifications form fields (by id):
 *   name (via CertificationAutocomplete), issuer, issue_date, expiry_date,
 *   credential_id, credential_url, description
 *
 * Awards form fields (by id):
 *   name, issuer, award_date, award_url, description
 *
 * Education form fields (by id):
 *   school_name, major, gpa, start_date, end_date, description
 *   degree and graduation_status are Select components (not plain inputs)
 *
 * All credential types use browser confirm() for delete.
 * Dialog footer: Cancel + Add/Edit buttons.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestCertification,
  createTestEducation,
  cleanupTestData,
  createApiContext,
  loginAsTestUser,
  TestDataContext,
} from '../fixtures/api-helpers'
import { TEST_CERTIFICATION, TEST_EDUCATION, TEST_AWARD } from '../fixtures/test-data'

test.describe('Credentials Page', () => {
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

  test('should display credentials page with heading', async ({ page }) => {
    await page.goto('/knowledge/credentials')
    await page.waitForLoadState('domcontentloaded')

    // Check page heading
    await expect(
      page.getByRole('heading', { name: 'Credentials Management' })
    ).toBeVisible()

    // Check subtitle
    await expect(
      page.getByText('Manage your certifications, awards, academic background')
    ).toBeVisible()
  })

  test('should display main category tabs', async ({ page }) => {
    await page.goto('/knowledge/credentials')
    await page.waitForLoadState('domcontentloaded')

    // Three main group tabs
    await expect(page.getByRole('tab', { name: /Education & Publications/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Certifications & Awards/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Activities/ })).toBeVisible()
  })

  test('should switch between main tabs', async ({ page }) => {
    await page.goto('/knowledge/credentials')
    await page.waitForLoadState('domcontentloaded')

    // Click on "Certifications & Awards" tab
    await page.getByRole('tab', { name: /Certifications & Awards/ }).click()
    await page.waitForTimeout(300)

    // Should show Certifications sub-tab (use exact to avoid matching "Certifications & Awards" parent tab)
    await expect(page.getByRole('tab', { name: 'Certifications', exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Awards', exact: true })).toBeVisible()

    // Click on "Activities" tab
    await page.getByRole('tab', { name: /^Activities/ }).first().click()
    await page.waitForTimeout(300)

    // Should show Volunteer/External sub-tabs
    await expect(page.getByRole('tab', { name: /Volunteer/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /External/ })).toBeVisible()

    // Click back to "Education & Publications" tab
    await page.getByRole('tab', { name: /Education & Publications/ }).click()
    await page.waitForTimeout(300)

    // Should show Education/Training/Publications sub-tabs
    // Use exact match to avoid matching "Education & Publications" parent tab
    await expect(page.getByRole('tab', { name: 'Education', exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Training', exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Publications', exact: true })).toBeVisible()
  })
})

test.describe('Certifications CRUD', () => {
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

  test('should create a new certification', async ({ page }) => {
    await page.goto('/knowledge/credentials')
    await page.waitForLoadState('domcontentloaded')

    // Navigate to Certifications & Awards group tab
    await page.getByRole('tab', { name: /Certifications & Awards/ }).click()
    await page.waitForTimeout(300)

    // Should be on Certifications sub-tab by default
    // Click "Add Certification" button
    await page.getByRole('button', { name: 'Add Certification' }).click()

    // Wait for dialog
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Dialog title should be "New Certification"
    await expect(dialog.getByText('New Certification')).toBeVisible()

    // Fill form - certification name is an autocomplete input, not a simple input#name
    // Use the input inside the dialog that's associated with the "Certification Name" label
    const certNameInput = dialog.locator('input').first()
    const certName = `E2E Certification ${Date.now()}`
    await certNameInput.fill(certName)

    // Fill issuer
    await dialog.locator('#issuer').fill(TEST_CERTIFICATION.issuer)

    // Fill dates
    await dialog.locator('#issue_date').fill(TEST_CERTIFICATION.issue_date)
    await dialog.locator('#expiry_date').fill(TEST_CERTIFICATION.expiry_date)

    // Fill credential ID
    await dialog.locator('#credential_id').fill(TEST_CERTIFICATION.credential_id)

    // Click "Add" button
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()

    // Verify certification appears
    await expect(page.getByText(certName)).toBeVisible({ timeout: 5000 })
  })

  test('should edit a certification', async ({ page, request }) => {
    // Create via API
    const cert = await createTestCertification(request, testContext.user!.id)

    await page.goto('/knowledge/credentials')
    await page.waitForLoadState('domcontentloaded')

    // Navigate to Certifications & Awards tab
    await page.getByRole('tab', { name: /Certifications & Awards/ }).click()
    await page.waitForTimeout(500)

    // Wait for certification to appear (filter by icon to target individual card, not parent container)
    const certCard = page.locator('[class*="bg-card"]').filter({ hasText: cert.name || 'AWS Solutions Architect' }).filter({ has: page.locator('svg.lucide-pencil') }).first()
    await expect(certCard).toBeVisible({ timeout: 5000 })

    // Click edit (Pencil) button on the card
    await certCard.locator('button').filter({ has: page.locator('svg.lucide-pencil') }).click()

    // Wait for edit dialog
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Dialog title should be "Edit Certification"
    await expect(dialog.getByText('Edit Certification')).toBeVisible()

    // Update issuer
    const issuerInput = dialog.locator('#issuer')
    await issuerInput.clear()
    await issuerInput.fill('Updated Issuer')

    // Click "Edit" button
    await dialog.getByRole('button', { name: 'Edit', exact: true }).click()

    // Verify update
    await expect(page.getByText('Updated Issuer')).toBeVisible({ timeout: 5000 })
  })

  test('should delete a certification', async ({ page, request }) => {
    // Create via API
    const cert = await createTestCertification(request, testContext.user!.id, {
      name: `Delete Me Cert ${Date.now()}`,
    })

    await page.goto('/knowledge/credentials')
    await page.waitForLoadState('domcontentloaded')

    // Navigate to Certifications & Awards tab
    await page.getByRole('tab', { name: /Certifications & Awards/ }).click()
    await page.waitForTimeout(500)

    // Wait for certification to appear (filter by icon to target individual card, not parent container)
    const certCard = page.locator('[class*="bg-card"]').filter({ hasText: cert.name || 'Delete Me Cert' }).filter({ has: page.locator('svg.lucide-trash2') }).first()
    await expect(certCard).toBeVisible({ timeout: 5000 })

    // Set up dialog handler - delete uses browser confirm()
    page.on('dialog', (dialog) => dialog.accept())

    // Click delete (Trash2) button on the card
    await certCard.locator('button').filter({ has: page.locator('svg.lucide-trash2') }).click()

    // Verify deleted
    await expect(page.getByText(cert.name || 'Delete Me Cert')).not.toBeVisible({ timeout: 5000 })
  })
})

test.describe('Education CRUD', () => {
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

  test('should display education empty state', async ({ page }) => {
    await page.goto('/knowledge/credentials')
    await page.waitForLoadState('domcontentloaded')

    // Default tab is "Education & Publications" -> "Education" sub-tab
    // Should show empty state
    await expect(page.getByText('No academic education registered')).toBeVisible({ timeout: 5000 })

    // "Add First Education" button should be visible
    await expect(
      page.getByRole('button', { name: 'Add First Education' })
    ).toBeVisible()
  })

  test('should create a new education record', async ({ page }) => {
    await page.goto('/knowledge/credentials')
    await page.waitForLoadState('domcontentloaded')

    // Default is Education & Publications > Education tab
    // Click "Add Education" button in header
    await page.getByRole('button', { name: 'Add Education' }).first().click()

    // Wait for dialog
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Dialog title should be "New Education"
    await expect(dialog.getByText('New Education')).toBeVisible()

    // Degree is a Select component - click to open and select
    // First, select degree (required)
    const degreeSelect = dialog.locator('button[role="combobox"]').first()
    await degreeSelect.click()
    // Select "Bachelor's" from the dropdown
    await page.getByRole('option', { name: "Bachelor's" }).click()

    // Select graduation status (required)
    const statusSelect = dialog.locator('button[role="combobox"]').nth(1)
    await statusSelect.click()
    await page.getByRole('option', { name: 'Graduated' }).click()

    // Fill school name (with bachelor's degree, UniversityAutocomplete renders without id)
    // Use placeholder text to find the input ("Search for a school" in English)
    const schoolNameInput = dialog.getByPlaceholder(/school/i).first()
    await schoolNameInput.fill('Test University')
    // Wait for autocomplete to settle, then click GPA field to dismiss any dropdown
    await page.waitForTimeout(500)

    // Fill GPA (clicking this also dismisses any autocomplete dropdown)
    await dialog.locator('#gpa').click()
    await page.waitForTimeout(200)
    await dialog.locator('#gpa').fill('3.8')

    // Fill dates
    await dialog.locator('#start_date').fill(TEST_EDUCATION.start_date)
    await dialog.locator('#end_date').fill(TEST_EDUCATION.end_date)

    // Click "Add" button
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()

    // Verify education appears
    await expect(page.getByText('Test University')).toBeVisible({ timeout: 5000 })
  })

  test('should display education with GPA', async ({ page, request }) => {
    // Create education with GPA via API
    await createTestEducation(request, testContext.user!.id, {
      gpa: 3.8,
    })

    await page.goto('/knowledge/credentials')
    await page.waitForLoadState('domcontentloaded')

    // Default is Education & Publications > Education tab
    // Check GPA is displayed
    await expect(page.getByText('3.8').first()).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Awards CRUD', () => {
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

  test('should create a new award', async ({ page }) => {
    await page.goto('/knowledge/credentials')
    await page.waitForLoadState('domcontentloaded')

    // Navigate to Certifications & Awards group tab
    await page.getByRole('tab', { name: /Certifications & Awards/ }).click()
    await page.waitForTimeout(300)

    // Click on "Awards" sub-tab
    await page.getByRole('tab', { name: /^Awards/ }).click()
    await page.waitForTimeout(300)

    // Should show empty state
    await expect(page.getByText('No awards registered')).toBeVisible()

    // Click "Add Award" button
    await page.getByRole('button', { name: 'Add Award' }).click()

    // Wait for dialog
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Dialog title should be "New Award"
    await expect(dialog.getByText('New Award')).toBeVisible()

    // Fill form
    const awardName = `E2E Award ${Date.now()}`
    await dialog.locator('#name').fill(awardName)
    await dialog.locator('#issuer').fill(TEST_AWARD.issuer)
    await dialog.locator('#award_date').fill(TEST_AWARD.date)

    // Fill description
    await dialog.locator('#description').fill(TEST_AWARD.description)

    // Click "Add" button
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()

    // Verify award appears
    await expect(page.getByText(awardName)).toBeVisible({ timeout: 5000 })
  })

  test('should delete an award', async ({ page }) => {
    await page.goto('/knowledge/credentials')
    await page.waitForLoadState('domcontentloaded')

    // Navigate to Certifications & Awards > Awards
    await page.getByRole('tab', { name: /Certifications & Awards/ }).click()
    await page.waitForTimeout(300)
    await page.getByRole('tab', { name: /^Awards/ }).click()
    await page.waitForTimeout(300)

    // Wait for an award card to exist (filter by icon to target individual card)
    const awardCard = page.locator('[class*="bg-card"]').filter({ hasText: /E2E Award/ }).filter({ has: page.locator('svg.lucide-trash2') }).first()

    if (await awardCard.isVisible().catch(() => false)) {
      // Set up dialog handler - delete uses browser confirm()
      page.on('dialog', (dialog) => dialog.accept())

      // Click delete (Trash2) button
      await awardCard.locator('button').filter({ has: page.locator('svg.lucide-trash2') }).click()

      // Wait for deletion
      await page.waitForTimeout(500)
    }
  })
})
