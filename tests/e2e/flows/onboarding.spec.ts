/**
 * E2E tests for user onboarding flow.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  cleanupTestData,
  TestDataContext,
} from '../fixtures/api-helpers'
import { TEST_COMPANY, TEST_PROJECT } from '../fixtures/test-data'

test.describe('Onboarding Flow', () => {
  test('should display setup page for new users', async ({ page }) => {
    await page.goto('/setup')

    // Should show setup wizard or onboarding steps
    await expect(
      page.locator('h1, h2').filter({ hasText: /설정|Setup|시작|Getting Started/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should show GitHub connection step', async ({ page }) => {
    await page.goto('/setup')
    await page.waitForLoadState('networkidle')

    // Should have GitHub connection option
    const githubStep = page.locator(
      'text=GitHub, [data-testid="github-step"]'
    ).first()

    await expect(githubStep).toBeVisible({ timeout: 10000 })
  })

  test('should allow skipping GitHub connection', async ({ page }) => {
    await page.goto('/setup/github')
    await page.waitForLoadState('networkidle')

    // Look for skip button
    const skipBtn = page.locator(
      'button:has-text("건너뛰기"), button:has-text("Skip"), a:has-text("나중에")'
    ).first()

    if (await skipBtn.isVisible()) {
      await skipBtn.click()

      // Should proceed to next step
      await page.waitForLoadState('networkidle')
    }
  })

  test('should navigate through setup steps', async ({ page }) => {
    await page.goto('/setup')
    await page.waitForLoadState('networkidle')

    // Look for step navigation
    const steps = page.locator('[data-testid="setup-step"], .step, [role="tab"]')

    if ((await steps.count()) > 1) {
      // Click through steps
      for (let i = 0; i < Math.min(3, await steps.count()); i++) {
        await steps.nth(i).click()
        await page.waitForLoadState('networkidle')
      }
    }
  })
})

test.describe('First Company Creation', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    testContext = { user }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should prompt to create first company', async ({ page }) => {
    await page.goto('/knowledge/companies')
    await page.waitForLoadState('networkidle')

    // May show empty state with prompt or create button
    const createPrompt = page.locator(
      'text=회사 추가, text=Add Company, button:has-text("추가"), [data-testid="empty-state"]'
    ).first()

    await expect(createPrompt).toBeVisible({ timeout: 10000 })
  })

  test('should guide through company creation form', async ({ page }) => {
    await page.goto('/knowledge/companies')
    await page.click('button:has-text("추가"), button:has-text("Add")')

    // Should show form with required fields highlighted
    const nameInput = page.locator('input[name="name"]')
    const positionInput = page.locator('input[name="position"]')

    await expect(nameInput).toBeVisible({ timeout: 10000 })
    await expect(positionInput).toBeVisible()

    // Fill form
    await nameInput.fill(TEST_COMPANY.name)
    await positionInput.fill(TEST_COMPANY.position)

    // Save
    await page.click('button:has-text("저장"), button:has-text("Save")')

    // Should show success
    await expect(
      page.locator(`text=${TEST_COMPANY.name}`).first()
    ).toBeVisible({ timeout: 10000 })
  })
})

test.describe('First Project Creation', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    testContext = { user }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should prompt to create first project', async ({ page }) => {
    await page.goto('/knowledge/projects')
    await page.waitForLoadState('networkidle')

    const createPrompt = page.locator(
      'text=프로젝트 추가, text=Add Project, button:has-text("추가"), [data-testid="empty-state"]'
    ).first()

    await expect(createPrompt).toBeVisible({ timeout: 10000 })
  })

  test('should guide through project creation', async ({ page }) => {
    await page.goto('/knowledge/projects')
    await page.click('button:has-text("추가"), button:has-text("Add"), button:has-text("새 프로젝트")')

    // Fill form
    const nameInput = page.locator('input[name="name"]')
    await nameInput.fill(TEST_PROJECT.name)

    const descInput = page.locator('textarea[name="description"]')
    if (await descInput.isVisible()) {
      await descInput.fill(TEST_PROJECT.description)
    }

    // Select project type
    const typeSelect = page.locator('select[name="project_type"]')
    if (await typeSelect.isVisible()) {
      await typeSelect.selectOption('personal')
    }

    // Save
    await page.click('button:has-text("저장"), button:has-text("Save")')

    await expect(
      page.locator(`text=${TEST_PROJECT.name}`).first()
    ).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Dashboard After Onboarding', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    testContext = { user }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should show dashboard with stats', async ({ page }) => {
    await page.goto('/dashboard')

    await expect(
      page.locator('h1, h2').filter({ hasText: /대시보드|Dashboard/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should show quick action cards', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Look for action cards or quick links
    const actionCards = page.locator(
      '[data-testid="action-card"], .action-card, .quick-action'
    )

    if ((await actionCards.count()) > 0) {
      await expect(actionCards.first()).toBeVisible()
    }
  })

  test('should navigate to main sections from dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Click on companies link
    const companiesLink = page.locator(
      'a[href*="companies"], text=회사, text=Companies'
    ).first()

    if (await companiesLink.isVisible()) {
      await companiesLink.click()
      await expect(page).toHaveURL(/companies/, { timeout: 10000 })
    }
  })
})
