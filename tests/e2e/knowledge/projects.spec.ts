/**
 * E2E tests for Projects management.
 *
 * Selectors are based on the actual Projects page UI:
 * - Page heading: "Project Management" (h1)
 * - Empty state: "No projects registered" + "Add First Project" button
 * - Top buttons: "Import Repos", "Export", "List"/"Kanban" toggle, "Add Project"
 * - Search input with placeholder "Search project name..."
 * - Project list with project name as link (<h3>), status badges
 * - Edit/Delete icon buttons (Pencil/Trash2) per project card
 * - Create dialog: title "Add New Project", form fields use id="name",
 *   id="short_description", id="start_date", id="end_date", id="role", id="team_size"
 * - Dialog footer: Cancel + Add buttons
 * - Delete confirmation: AlertDialog with title "Delete Project" and "Delete" action button
 * - Edit dialog: title "Edit Project", form fields use id="edit_name", etc.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestCompany,
  createTestProject,
  cleanupTestData,
  createApiContext,
  loginAsTestUser,
  TestDataContext,
} from '../fixtures/api-helpers'
import { TEST_PROJECT } from '../fixtures/test-data'

test.describe('Projects CRUD', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      const company = await createTestCompany(request, user.id)
      testContext = { user, company }
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

  test('should display projects list page', async ({ page }) => {
    await page.goto('/knowledge/projects')
    await page.waitForLoadState('domcontentloaded')

    // Page heading: "Project Management"
    await expect(
      page.getByRole('heading', { name: 'Project Management' })
    ).toBeVisible()
  })

  test('should show header buttons', async ({ page }) => {
    await page.goto('/knowledge/projects')
    await page.waitForLoadState('domcontentloaded')

    // Check for key action buttons
    await expect(page.getByRole('button', { name: 'Add Project' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Import Repos/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Export/ })).toBeVisible()
  })

  test('should create a new project', async ({ page }) => {
    await page.goto('/knowledge/projects')
    await page.waitForLoadState('domcontentloaded')

    // Click "Add Project" button
    await page.getByRole('button', { name: 'Add Project' }).click()

    // Wait for dialog
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Dialog title should be "Add New Project"
    await expect(dialog.getByText('Add New Project')).toBeVisible()

    // Fill form fields by id
    const projectName = `E2E Project ${Date.now()}`
    await dialog.locator('#name').fill(projectName)
    await dialog.locator('#short_description').fill(TEST_PROJECT.description)
    await dialog.locator('#start_date').fill(TEST_PROJECT.start_date)
    await dialog.locator('#role').fill(TEST_PROJECT.role)
    await dialog.locator('#team_size').fill(String(TEST_PROJECT.team_size))

    // Click submit button in dialog footer (multiple "Add" buttons exist: tag input, cancel area, submit)
    await dialog.locator('button[type="submit"]').click()

    // Verify project appears in list
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 5000 })
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
    await page.waitForLoadState('domcontentloaded')

    // Wait for project to appear
    await expect(page.getByText(project.name)).toBeVisible({ timeout: 5000 })

    // Click edit (Pencil) icon button on the project card (filter by icon to target individual card)
    const projectCard = page.locator('[class*="card"]').filter({ hasText: project.name }).filter({ has: page.locator('svg.lucide-pencil') }).first()
    await projectCard.locator('button').filter({ has: page.locator('svg.lucide-pencil') }).click()

    // Wait for edit dialog
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Dialog title should be "Edit Project"
    await expect(dialog.getByText('Edit Project')).toBeVisible()

    // Update the name (edit form uses "edit_" prefix for ids)
    const nameInput = dialog.locator('#edit_name')
    await nameInput.clear()
    const updatedName = `Updated Project ${Date.now()}`
    await nameInput.fill(updatedName)

    // Click "Save" button in dialog footer
    await dialog.getByRole('button', { name: 'Save' }).click()

    // Verify update
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 5000 })
  })

  test('should delete a project', async ({ page, request }) => {
    // Create project via API
    const project = await createTestProject(request, testContext.user!.id, undefined, {
      name: `Delete Me Project ${Date.now()}`,
    })

    await page.goto('/knowledge/projects')
    await page.waitForLoadState('domcontentloaded')

    // Wait for project to appear
    await expect(page.getByText(project.name)).toBeVisible({ timeout: 5000 })

    // Click delete (Trash2) icon button on the project card (filter by icon to target individual card)
    const projectCard = page.locator('[class*="card"]').filter({ hasText: project.name }).filter({ has: page.locator('svg.lucide-trash2') }).first()
    await projectCard.locator('button').filter({ has: page.locator('svg.lucide-trash2') }).click()

    // AlertDialog should appear with "Delete Project" title
    const alertDialog = page.getByRole('alertdialog')
    await expect(alertDialog).toBeVisible()
    await expect(alertDialog.getByText('Delete Project')).toBeVisible()

    // Click "Delete" confirmation button in the AlertDialog
    await alertDialog.getByRole('button', { name: 'Delete' }).click()

    // Verify deleted
    await expect(page.getByText(project.name)).not.toBeVisible({ timeout: 5000 })
  })

  test('should search projects', async ({ page, request }) => {
    // Create a project with a unique name
    const uniqueName = `SearchTarget ${Date.now()}`
    await createTestProject(request, testContext.user!.id, undefined, {
      name: uniqueName,
    })

    await page.goto('/knowledge/projects')
    await page.waitForLoadState('domcontentloaded')

    // Wait for project list to load
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 5000 })

    // Type in search input
    const searchInput = page.getByPlaceholder('Search project name...')
    await searchInput.fill('SearchTarget')

    // Click "Search" button
    await page.getByRole('button', { name: 'Search', exact: true }).click()

    // The search target should still be visible
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Projects with Technologies', () => {
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

  test('should display technology badges on project cards', async ({ page, request }) => {
    // Create project with technologies via API
    const project = await createTestProject(request, testContext.user!.id, undefined, {
      name: `Tech Project ${Date.now()}`,
      technologies: ['Python', 'React', 'PostgreSQL'],
    })

    await page.goto('/knowledge/projects')
    await page.waitForLoadState('domcontentloaded')

    // Wait for project to appear
    await expect(page.getByText(project.name)).toBeVisible({ timeout: 5000 })

    // Technology badges should be visible on the card
    // Use div[title] selector because TechBadge renders SVG with <title> that interferes with getByText
    await expect(page.locator('div[title="Python"]').first()).toBeVisible()
    await expect(page.locator('div[title="React"]').first()).toBeVisible()
  })
})

test.describe('Projects View Toggle', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      await createTestProject(request, user.id, undefined, {
        name: `View Toggle Project ${Date.now()}`,
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

  test('should toggle between list and kanban view', async ({ page }) => {
    await page.goto('/knowledge/projects')
    await page.waitForLoadState('domcontentloaded')

    // Default is list view - "List" button should be active
    const listButton = page.getByRole('button', { name: 'List' })
    const kanbanButton = page.getByRole('button', { name: 'Kanban' })

    await expect(listButton).toBeVisible()
    await expect(kanbanButton).toBeVisible()

    // Switch to kanban view
    await kanbanButton.click()
    await page.waitForTimeout(500)

    // Switch back to list view
    await listButton.click()
    await page.waitForTimeout(500)
  })
})
