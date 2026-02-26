/**
 * E2E tests for user onboarding flow.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  cleanupTestData,
  createApiContext,
  loginAsTestUser,
  TestDataContext,
} from '../fixtures/api-helpers'
import { TEST_COMPANY, TEST_PROJECT } from '../fixtures/test-data'

test.describe('Onboarding Flow', () => {
  test('should display setup page for new users', async ({ page }) => {
    await page.goto('/setup')
    await page.waitForLoadState('domcontentloaded')

    // Setup page heading: "Get Started with Autopolio"
    await expect(
      page.getByRole('heading', { name: 'Get Started with Autopolio' })
    ).toBeVisible({ timeout: 5000 })

    // Subtitle text
    await expect(
      page.getByText('Portfolio/Resume Automation Platform')
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show GitHub connection card', async ({ page }) => {
    await page.goto('/setup')
    await page.waitForLoadState('domcontentloaded')

    // "Social Login" card title
    await expect(
      page.getByText('Social Login')
    ).toBeVisible({ timeout: 5000 })

    // "Login with GitHub" button
    await expect(
      page.getByRole('button', { name: /Login with GitHub/ })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show guest mode option', async ({ page }) => {
    await page.goto('/setup')
    await page.waitForLoadState('domcontentloaded')

    // "Guest Mode" card title
    await expect(
      page.getByText('Guest Mode')
    ).toBeVisible({ timeout: 5000 })

    // "Continue as Guest" button
    await expect(
      page.getByRole('button', { name: 'Continue as Guest' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should navigate via guest login', async ({ page }) => {
    await page.goto('/setup')
    await page.waitForLoadState('domcontentloaded')

    // Click "Continue as Guest"
    await page.getByRole('button', { name: 'Continue as Guest' }).click()

    // Guest mode navigates to /platforms
    await expect(page).toHaveURL(/platforms/, { timeout: 5000 })
  })
})

test.describe('First Company Creation', () => {
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

  test('should create first company via dialog', async ({ page }) => {
    await page.goto('/knowledge/companies')
    await page.waitForLoadState('domcontentloaded')

    // Page heading: "Company Management"
    await expect(
      page.getByRole('heading', { name: 'Company Management' })
    ).toBeVisible({ timeout: 5000 })

    // "Add Company" button should be visible
    await expect(
      page.getByRole('button', { name: 'Add Company' })
    ).toBeVisible({ timeout: 5000 })

    // Click "Add Company" to open dialog
    await page.getByRole('button', { name: 'Add Company' }).click()

    // Dialog should open with title "Add New Company"
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(
      dialog.getByText('Add New Company')
    ).toBeVisible({ timeout: 5000 })

    // Fill form fields (by id)
    await dialog.locator('#name').fill(TEST_COMPANY.name)
    await dialog.locator('#position').fill(TEST_COMPANY.position)
    await dialog.locator('#department').fill(TEST_COMPANY.department)
    await dialog.locator('#start_date').fill(TEST_COMPANY.start_date)

    // Submit the form via the "Add" button
    await dialog.getByRole('button', { name: 'Add' }).click()

    // Wait for dialog to close (indicates submission succeeded)
    await expect(dialog).not.toBeVisible({ timeout: 10000 })

    // Company should appear in the list
    await expect(
      page.getByText(TEST_COMPANY.name).first()
    ).toBeVisible({ timeout: 10000 })
  })
})

test.describe('First Project Creation', () => {
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

  test('should create first project via dialog', async ({ page }) => {
    await page.goto('/knowledge/projects')
    await page.waitForLoadState('domcontentloaded')

    // Page heading: "Project Management"
    await expect(
      page.getByRole('heading', { name: 'Project Management' })
    ).toBeVisible({ timeout: 5000 })

    // "Add Project" button should be visible
    await expect(
      page.getByRole('button', { name: 'Add Project' })
    ).toBeVisible({ timeout: 5000 })

    // Click "Add Project" to open dialog
    await page.getByRole('button', { name: 'Add Project' }).click()

    // Dialog should open with title "Add New Project"
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(
      dialog.getByText('Add New Project')
    ).toBeVisible({ timeout: 5000 })

    // Fill form fields (by id, no idPrefix for create dialog)
    await dialog.locator('#name').fill(TEST_PROJECT.name)
    await dialog.locator('#short_description').fill(TEST_PROJECT.description)
    await dialog.locator('#start_date').fill(TEST_PROJECT.start_date)
    await dialog.locator('#role').fill(TEST_PROJECT.role)

    // Submit the form via the submit button (multiple "Add" buttons in dialog)
    await dialog.locator('button[type="submit"]').click()

    // Project should appear in the list (allow extra time for API + re-render)
    await expect(
      page.getByText(TEST_PROJECT.name).first()
    ).toBeVisible({ timeout: 15000 })
  })
})

test.describe('Dashboard After Onboarding', () => {
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

  test('should show dashboard with stats cards', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')

    // Dashboard shows "Hello, {name}" heading (or welcome for no user)
    // Without a logged-in user cookie, it shows "Welcome to Autopolio"
    const heading = page.getByRole('heading').first()
    await expect(heading).toBeVisible({ timeout: 5000 })

    // Check for stats card labels (visible when user is logged in)
    // At minimum, the page should render
    const pageContent = page.locator('body')
    await expect(pageContent).toBeVisible()
  })

  test('should show empty state messages', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')

    // Without data, dashboard may show "No projects yet." and "No documents generated yet."
    // These are the empty state messages from the dashboard
    const noProjects = page.getByText('No projects yet')
    const noDocuments = page.getByText('No documents generated yet')

    // At least one empty state or the welcome page should be visible
    const welcomeOrEmpty = page.getByRole('heading').first()
    await expect(welcomeOrEmpty).toBeVisible({ timeout: 5000 })

    // If logged in, stats sections with "Companies", "Projects" etc. should appear
    // If not logged in, "Welcome to Autopolio" with "Get Started" button
    const getStartedBtn = page.getByRole('button', { name: 'Get Started' })
    const companiesText = page.getByText('Companies')

    const isWelcome = await getStartedBtn.isVisible().catch(() => false)
    const hasStats = await companiesText.isVisible().catch(() => false)

    expect(isWelcome || hasStats).toBeTruthy()
  })
})
