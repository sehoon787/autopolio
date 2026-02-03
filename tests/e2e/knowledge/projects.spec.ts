/**
 * E2E tests for Projects management.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestCompany,
  createTestProject,
  cleanupTestData,
  TestDataContext,
} from '../fixtures/api-helpers'
import { SELECTORS, TEST_PROJECT, TEST_PERSONAL_PROJECT } from '../fixtures/test-data'

test.describe('Projects CRUD', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    const company = await createTestCompany(request, user.id)
    testContext = { user, company }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should display projects list page', async ({ page }) => {
    await page.goto('/knowledge/projects')

    // Check page title or header
    await expect(
      page.locator('h1, h2').filter({ hasText: /프로젝트|Projects/i }).first()
    ).toBeVisible()
  })

  test('should create a company project', async ({ page }) => {
    await page.goto('/knowledge/projects')

    // Click add button
    await page.click(SELECTORS.BTN_ADD)

    // Fill form
    const projectName = `E2E Company Project ${Date.now()}`
    await page.fill(SELECTORS.INPUT_NAME, projectName)

    // Fill description if available
    const descInput = page.locator(SELECTORS.INPUT_DESCRIPTION)
    if (await descInput.isVisible()) {
      await descInput.fill(TEST_PROJECT.description)
    }

    // Select project type if available
    const typeSelect = page.locator(SELECTORS.SELECT_PROJECT_TYPE)
    if (await typeSelect.isVisible()) {
      await typeSelect.selectOption('company')
    }

    // Select company
    const companySelect = page.locator(SELECTORS.SELECT_COMPANY)
    if (await companySelect.isVisible()) {
      // Select first available company
      await companySelect.selectOption({ index: 1 })
    }

    // Fill dates
    const startDate = page.locator(SELECTORS.INPUT_START_DATE)
    if (await startDate.isVisible()) {
      await startDate.fill(TEST_PROJECT.start_date)
    }

    // Save
    await page.click(SELECTORS.BTN_SAVE)

    // Verify success
    await expect(
      page.locator(`text=${projectName}`).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should create a personal project', async ({ page }) => {
    await page.goto('/knowledge/projects')
    await page.click(SELECTORS.BTN_ADD)

    const projectName = `E2E Personal Project ${Date.now()}`
    await page.fill(SELECTORS.INPUT_NAME, projectName)

    // Select personal project type
    const typeSelect = page.locator(SELECTORS.SELECT_PROJECT_TYPE)
    if (await typeSelect.isVisible()) {
      await typeSelect.selectOption('personal')
    }

    // Fill description
    const descInput = page.locator(SELECTORS.INPUT_DESCRIPTION)
    if (await descInput.isVisible()) {
      await descInput.fill(TEST_PERSONAL_PROJECT.description)
    }

    await page.click(SELECTORS.BTN_SAVE)

    await expect(
      page.locator(`text=${projectName}`).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should edit an existing project', async ({ page, request }) => {
    // Create project via API
    const project = await createTestProject(
      request,
      testContext.user!.id,
      testContext.company!.id
    )
    testContext.project = project

    await page.goto('/knowledge/projects')
    await page.waitForLoadState('networkidle')

    // Find and edit the project
    const projectRow = page.locator(`text=${project.name}`).first()
    await expect(projectRow).toBeVisible({ timeout: 10000 })

    // Click edit
    const editBtn = page.locator(SELECTORS.BTN_EDIT).first()
    if (await editBtn.isVisible()) {
      await editBtn.click()
    } else {
      await projectRow.click()
    }

    // Update name
    const nameInput = page.locator(SELECTORS.INPUT_NAME)
    await nameInput.clear()
    const updatedName = `Updated Project ${Date.now()}`
    await nameInput.fill(updatedName)

    await page.click(SELECTORS.BTN_SAVE)

    await expect(
      page.locator(`text=${updatedName}`).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should delete a project', async ({ page, request }) => {
    // Create project via API
    const project = await createTestProject(request, testContext.user!.id, undefined, {
      name: `Delete Me Project ${Date.now()}`,
    })

    await page.goto('/knowledge/projects')
    await page.waitForLoadState('networkidle')

    // Find the project
    const projectRow = page.locator(`text=${project.name}`).first()
    await expect(projectRow).toBeVisible({ timeout: 10000 })

    // Click delete
    const deleteBtn = page.locator(SELECTORS.BTN_DELETE).first()
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click()
    } else {
      await projectRow.click()
      await page.click(SELECTORS.BTN_DELETE)
    }

    // Confirm
    const confirmBtn = page.locator(SELECTORS.BTN_CONFIRM)
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click()
    }

    // Verify deleted
    await expect(page.locator(`text=${project.name}`)).not.toBeVisible({ timeout: 10000 })
  })
})

test.describe('Projects with Technologies', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    testContext = { user }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should display technology badges', async ({ page, request }) => {
    // Create project with technologies via API
    const project = await createTestProject(request, testContext.user!.id, undefined, {
      name: `Tech Project ${Date.now()}`,
      technologies: ['Python', 'React', 'PostgreSQL'],
    })

    await page.goto('/knowledge/projects')
    await page.waitForLoadState('networkidle')

    // Find project
    const projectRow = page.locator(`text=${project.name}`).first()
    await expect(projectRow).toBeVisible({ timeout: 10000 })

    // Check for technology badges (may be badges, chips, or text)
    await expect(
      page.locator('text=Python').or(page.locator('[data-testid*="tech"]')).first()
    ).toBeVisible()
  })
})

test.describe('Projects Filtering', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    const company = await createTestCompany(request, user.id)

    // Create various projects
    await createTestProject(request, user.id, company.id, {
      name: 'Filter Test Company Project',
    })
    await createTestProject(request, user.id, undefined, {
      name: 'Filter Test Personal Project',
      project_type: 'personal',
    })

    testContext = { user, company }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should filter projects by type', async ({ page }) => {
    await page.goto('/knowledge/projects')
    await page.waitForLoadState('networkidle')

    // Look for filter controls
    const filterSelect = page.locator('select[name="filter"], select[name="type"]')
    const filterTabs = page.locator('[role="tablist"], [data-testid="filter-tabs"]')

    if (await filterSelect.isVisible()) {
      await filterSelect.selectOption('personal')
      await page.waitForLoadState('networkidle')

      // Should show personal projects only
      await expect(page.locator('text=Personal Project').first()).toBeVisible()
    } else if (await filterTabs.isVisible()) {
      // Click on personal tab
      await page.click('text=Personal, text=개인')
      await page.waitForLoadState('networkidle')
    }
  })
})
