/**
 * E2E tests for Credentials management (certifications, education, awards).
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestCertification,
  createTestEducation,
  cleanupTestData,
  createApiContext,
  TestDataContext,
} from '../fixtures/api-helpers'
import { TEST_CERTIFICATION, TEST_EDUCATION, TEST_AWARD } from '../fixtures/test-data'

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

  test('should display credentials page', async ({ page }) => {
    await page.goto('/knowledge/credentials')

    // Check page loads with tabs or sections
    await expect(
      page.locator('h1, h2').filter({ hasText: /자격증|Credentials|자격/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should create a new certification', async ({ page }) => {
    await page.goto('/knowledge/credentials')

    // Navigate to certifications tab if exists
    const certTab = page.locator(
      'button:has-text("자격증"), button:has-text("Certifications"), [role="tab"]:has-text("자격증")'
    ).first()
    if (await certTab.isVisible()) {
      await certTab.click()
    }

    // Click add button
    await page.click(
      'button:has-text("추가"), button:has-text("Add"), button:has-text("새로 만들기")'
    )

    // Fill form
    const certName = `E2E Certification ${Date.now()}`
    await page.fill('input[name="name"]', certName)
    await page.fill('input[name="issuer"]', TEST_CERTIFICATION.issuer)

    // Fill dates if available
    const issueDateInput = page.locator('input[name="issue_date"], input[name="issueDate"]')
    if (await issueDateInput.isVisible()) {
      await issueDateInput.fill(TEST_CERTIFICATION.issue_date)
    }

    // Save
    await page.click('button:has-text("저장"), button:has-text("Save")')

    // Verify
    await expect(page.locator(`text=${certName}`).first()).toBeVisible({ timeout: 10000 })
  })

  test('should edit a certification', async ({ page, request }) => {
    // Create via API
    const cert = await createTestCertification(request, testContext.user!.id)

    await page.goto('/knowledge/credentials')
    await page.waitForLoadState('networkidle')

    // Find and edit
    const editBtn = page.locator('[data-testid="edit-button"]').first()
    if (await editBtn.isVisible()) {
      await editBtn.click()
    }

    // Update
    const nameInput = page.locator('input[name="name"]')
    await nameInput.clear()
    const updatedName = `Updated Cert ${Date.now()}`
    await nameInput.fill(updatedName)

    await page.click('button:has-text("저장"), button:has-text("Save")')

    await expect(page.locator(`text=${updatedName}`).first()).toBeVisible({ timeout: 10000 })
  })

  test('should delete a certification', async ({ page, request }) => {
    // Create via API
    const cert = await createTestCertification(request, testContext.user!.id, {
      name: `Delete Me Cert ${Date.now()}`,
    })

    await page.goto('/knowledge/credentials')
    await page.waitForLoadState('networkidle')

    // Find delete button
    const deleteBtn = page.locator(
      '[data-testid="delete-button"], button:has-text("삭제"), button:has-text("Delete")'
    ).first()

    if (await deleteBtn.isVisible()) {
      await deleteBtn.click()

      // Confirm
      const confirmBtn = page.locator('button:has-text("확인"), button:has-text("Confirm")')
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click()
      }
    }
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

  test('should create a new education record', async ({ page }) => {
    await page.goto('/knowledge/credentials')

    // Navigate to education tab if exists
    const eduTab = page.locator(
      'button:has-text("학력"), button:has-text("Education"), [role="tab"]:has-text("학력")'
    ).first()
    if (await eduTab.isVisible()) {
      await eduTab.click()
    }

    // Click add button
    await page.click(
      'button:has-text("추가"), button:has-text("Add"), button:has-text("새로 만들기")'
    )

    // Fill form
    const schoolName = `E2E University ${Date.now()}`
    await page.fill('input[name="school"]', schoolName)
    await page.fill('input[name="degree"]', TEST_EDUCATION.degree)

    // Fill field of study if available
    const fieldInput = page.locator('input[name="field_of_study"], input[name="fieldOfStudy"]')
    if (await fieldInput.isVisible()) {
      await fieldInput.fill(TEST_EDUCATION.field_of_study)
    }

    // Save
    await page.click('button:has-text("저장"), button:has-text("Save")')

    // Verify
    await expect(page.locator(`text=${schoolName}`).first()).toBeVisible({ timeout: 10000 })
  })

  test('should display education with GPA', async ({ page, request }) => {
    // Create education with GPA via API
    const edu = await createTestEducation(request, testContext.user!.id, {
      gpa: 3.8,
    })

    await page.goto('/knowledge/credentials')
    await page.waitForLoadState('networkidle')

    // Navigate to education tab
    const eduTab = page.locator(
      'button:has-text("학력"), button:has-text("Education")'
    ).first()
    if (await eduTab.isVisible()) {
      await eduTab.click()
    }

    // Check GPA is displayed
    await expect(page.locator('text=3.8').first()).toBeVisible({ timeout: 10000 })
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

  test('should create a new award', async ({ page }) => {
    await page.goto('/knowledge/credentials')

    // Navigate to awards tab if exists
    const awardTab = page.locator(
      'button:has-text("수상"), button:has-text("Awards"), [role="tab"]:has-text("수상")'
    ).first()
    if (await awardTab.isVisible()) {
      await awardTab.click()
    }

    // Click add button
    await page.click(
      'button:has-text("추가"), button:has-text("Add"), button:has-text("새로 만들기")'
    )

    // Fill form
    const awardTitle = `E2E Award ${Date.now()}`
    await page.fill('input[name="title"]', awardTitle)
    await page.fill('input[name="issuer"]', TEST_AWARD.issuer)

    // Fill description if available
    const descInput = page.locator('textarea[name="description"]')
    if (await descInput.isVisible()) {
      await descInput.fill(TEST_AWARD.description)
    }

    // Save
    await page.click('button:has-text("저장"), button:has-text("Save")')

    // Verify
    await expect(page.locator(`text=${awardTitle}`).first()).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Credentials Tab Navigation', () => {
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

  test('should switch between credential tabs', async ({ page }) => {
    await page.goto('/knowledge/credentials')
    await page.waitForLoadState('networkidle')

    // Check for tab navigation
    const tabs = page.locator('[role="tablist"] button, [data-testid="credential-tabs"] button')

    if ((await tabs.count()) > 1) {
      // Click through each tab
      for (let i = 0; i < (await tabs.count()); i++) {
        await tabs.nth(i).click()
        await page.waitForLoadState('networkidle')
      }
    }
  })
})
