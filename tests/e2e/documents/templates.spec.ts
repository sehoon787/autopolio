/**
 * E2E tests for Template management.
 *
 * Selectors are based on the actual Templates page UI:
 * - Page heading: "Template Management" (h1)
 * - Subtitle: "Manage resume and portfolio templates."
 * - "New Template" button (Plus icon, navigates to /templates/new/edit)
 * - "Upload File" button (Upload icon, triggers file input)
 * - "System Templates" section heading (h2)
 * - "My Templates" section heading (h2, only shown when user templates exist)
 * - System template cards: name (CardTitle), platform label, output format badge, "Clone" button (Copy icon)
 * - User template cards: name, "Edit" button, clone icon button, delete (Trash2) icon button
 * - Empty state: "No templates" text + "No templates. Initialize system templates or upload your own."
 * - Clone uses browser prompt() dialog
 *
 * Template Editor page (/templates/:id/edit or /templates/new/edit):
 * - Heading: "Create New Template" or "Edit Template"
 * - "Go Back" button (ArrowLeft icon)
 * - Template Info card: input#name, input#description
 * - Template Content textarea (id="template-content")
 * - Preview panel with tabs: "Rendered", "Text", "Fields Used"
 * - "Save" button, "Fullscreen" button, "Preview" button (RefreshCw icon)
 * - Available Fields panel below editor
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestTemplate,
  cleanupTestData,
  createApiContext,
  loginAsTestUser,
  TestDataContext,
} from '../fixtures/api-helpers'

test.describe('Template List Page', () => {
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

  test('should display templates page heading', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByRole('heading', { name: 'Template Management' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show subtitle text', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByText('Manage resume and portfolio templates.')
    ).toBeVisible({ timeout: 5000 })
  })

  test('should have New Template button', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByRole('button', { name: 'New Template' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should have Upload File button', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('domcontentloaded')

    // Upload File is rendered as a label > Button asChild > span, not a real <button>
    await expect(
      page.getByText('Upload File')
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show System Templates section heading', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByRole('heading', { name: 'System Templates' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show Clone button on system templates', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('domcontentloaded')

    // System templates have "Clone" buttons
    const cloneButtons = page.getByRole('button', { name: 'Clone' })
    await expect(cloneButtons.first()).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Template Editor - New Template', () => {
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

  test('should navigate to create new template page', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('button', { name: 'New Template' }).click()

    // Should navigate to /templates/new/edit
    await expect(page).toHaveURL(/\/templates\/new\/edit/)
  })

  test('should display Create New Template heading', async ({ page }) => {
    await page.goto('/templates/new/edit')
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByRole('heading', { name: 'Create New Template' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show template name input', async ({ page }) => {
    await page.goto('/templates/new/edit')
    await page.waitForLoadState('domcontentloaded')

    const nameInput = page.locator('#name')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
  })

  test('should show template content textarea', async ({ page }) => {
    await page.goto('/templates/new/edit')
    await page.waitForLoadState('domcontentloaded')

    const contentTextarea = page.locator('#template-content')
    await expect(contentTextarea).toBeVisible({ timeout: 5000 })
  })

  test('should show Save and Fullscreen buttons', async ({ page }) => {
    await page.goto('/templates/new/edit')
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByRole('button', { name: 'Save' })
    ).toBeVisible({ timeout: 5000 })

    await expect(
      page.getByRole('button', { name: 'Fullscreen' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show Go Back button', async ({ page }) => {
    await page.goto('/templates/new/edit')
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByRole('button', { name: 'Go Back' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show preview panel with Rendered tab', async ({ page }) => {
    await page.goto('/templates/new/edit')
    await page.waitForLoadState('domcontentloaded')

    // Preview panel heading
    await expect(page.getByText('Preview')).toBeVisible({ timeout: 5000 })

    // Tab triggers
    await expect(page.getByRole('tab', { name: 'Rendered' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('tab', { name: 'Text' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('tab', { name: 'Fields Used' })).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Template Editor - Edit Existing', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      const template = await createTestTemplate(request, user.id, {
        name: `Edit Test Template ${Date.now()}`,
      })
      testContext = { user, template }
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

  test('should display Edit Template heading', async ({ page }) => {
    if (!testContext.template) {
      test.skip()
      return
    }

    await page.goto(`/templates/${testContext.template.id}/edit`)
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByRole('heading', { name: 'Edit Template' })
    ).toBeVisible({ timeout: 5000 })
  })

  test('should show pre-filled template name', async ({ page }) => {
    if (!testContext.template) {
      test.skip()
      return
    }

    await page.goto(`/templates/${testContext.template.id}/edit`)
    await page.waitForLoadState('domcontentloaded')

    const nameInput = page.locator('#name')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    // Name should be pre-filled from the template
    await expect(nameInput).not.toHaveValue('')
  })

  test('should show Template Info card', async ({ page }) => {
    if (!testContext.template) {
      test.skip()
      return
    }

    await page.goto(`/templates/${testContext.template.id}/edit`)
    await page.waitForLoadState('domcontentloaded')

    // Template Info card title
    await expect(page.getByText('Template Info')).toBeVisible({ timeout: 5000 })

    // Both name and description inputs
    await expect(page.locator('#name')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('#description')).toBeVisible({ timeout: 5000 })
  })
})
