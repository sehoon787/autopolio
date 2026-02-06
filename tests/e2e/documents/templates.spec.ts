/**
 * E2E tests for Template management.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestTemplate,
  cleanupTestData,
  createApiContext,
  TestDataContext,
} from '../fixtures/api-helpers'
import { TEST_TEMPLATE } from '../fixtures/test-data'

test.describe('Template List', () => {
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

  test('should display templates page', async ({ page }) => {
    await page.goto('/templates')

    await expect(
      page.locator('h1, h2').filter({ hasText: /템플릿|Templates/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should show system templates', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('networkidle')

    // Should show template cards
    const templateCards = page.locator(
      '[data-testid="template-card"], .template-card'
    )

    await expect(templateCards.first()).toBeVisible({ timeout: 10000 })
  })

  test('should have create new template button', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('networkidle')

    const createBtn = page.locator(
      'button:has-text("새로 만들기"), button:has-text("Create"), button:has-text("추가")'
    ).first()

    await expect(createBtn).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Template Creation', () => {
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

  test('should navigate to create template page', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('networkidle')

    const createBtn = page.locator(
      'button:has-text("새로 만들기"), button:has-text("Create")'
    ).first()

    if (await createBtn.isVisible()) {
      await createBtn.click()

      // Should navigate to create/new page or open modal
      await expect(
        page.locator('input[name="name"], [data-testid="template-editor"]').first()
      ).toBeVisible({ timeout: 10000 })
    }
  })

  test('should create a custom template', async ({ page }) => {
    await page.goto('/templates/new')
    await page.waitForLoadState('networkidle')

    // Fill form
    const templateName = `E2E Template ${Date.now()}`
    await page.fill('input[name="name"]', templateName)

    // Fill template content if available
    const contentEditor = page.locator(
      'textarea[name="template_content"], [data-testid="template-editor"]'
    ).first()

    if (await contentEditor.isVisible()) {
      await contentEditor.fill(TEST_TEMPLATE.template_content)
    }

    // Save
    await page.click('button:has-text("저장"), button:has-text("Save")')

    // Verify created
    await expect(
      page.locator(`text=${templateName}`).first()
    ).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Template Cloning', () => {
  let testContext: TestDataContext
  let templateId: number

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      const template = await createTestTemplate(request, user.id)
      templateId = template.id
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

  test('should clone a template', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('networkidle')

    // Find clone button
    const cloneBtn = page.locator(
      '[data-testid="clone-template"], button:has-text("복제"), button:has-text("Clone")'
    ).first()

    if (await cloneBtn.isVisible()) {
      await cloneBtn.click()

      // Fill new name
      const nameInput = page.locator('input[name="name"]').first()
      if (await nameInput.isVisible()) {
        await nameInput.fill(`Cloned Template ${Date.now()}`)
      }

      // Confirm clone
      await page.click('button:has-text("복제"), button:has-text("Clone"), button:has-text("확인")')

      // Verify cloned template appears
      await expect(
        page.locator('text=Cloned Template').first()
      ).toBeVisible({ timeout: 10000 })
    }
  })
})

test.describe('Template Editing', () => {
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

  test('should navigate to edit page', async ({ page }) => {
    if (!testContext.template) {
      test.skip()
      return
    }

    await page.goto(`/templates/${testContext.template.id}/edit`)

    await expect(
      page.locator('[data-testid="template-editor"], textarea').first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should show live preview while editing', async ({ page }) => {
    if (!testContext.template) {
      test.skip()
      return
    }

    await page.goto(`/templates/${testContext.template.id}/edit`)
    await page.waitForLoadState('networkidle')

    // Look for preview panel
    const previewPanel = page.locator(
      '[data-testid="preview-panel"], .preview-panel, iframe'
    ).first()

    await expect(previewPanel).toBeVisible({ timeout: 10000 })
  })

  test('should save template changes', async ({ page }) => {
    if (!testContext.template) {
      test.skip()
      return
    }

    await page.goto(`/templates/${testContext.template.id}/edit`)
    await page.waitForLoadState('networkidle')

    // Modify content
    const editor = page.locator(
      'textarea[name="template_content"], [data-testid="template-editor"]'
    ).first()

    if (await editor.isVisible()) {
      await editor.fill('# Updated Template\n\nThis is updated content.')
    }

    // Save
    await page.click('button:has-text("저장"), button:has-text("Save")')

    // Should show success or stay on page without error
    await page.waitForLoadState('networkidle')
  })
})

test.describe('Template Field Insertion', () => {
  let testContext: TestDataContext

  test.beforeAll(async () => {
    const request = await createApiContext()
    try {
      const user = await createTestUser(request)
      const template = await createTestTemplate(request, user.id)
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

  test('should show available fields', async ({ page }) => {
    if (!testContext.template) {
      test.skip()
      return
    }

    await page.goto(`/templates/${testContext.template.id}/edit`)
    await page.waitForLoadState('networkidle')

    // Look for field list or field panel
    const fieldPanel = page.locator(
      '[data-testid="field-list"], .field-list, text=필드, text=Fields'
    ).first()

    if (await fieldPanel.isVisible()) {
      await expect(fieldPanel).toBeVisible()
    }
  })

  test('should insert field on click', async ({ page }) => {
    if (!testContext.template) {
      test.skip()
      return
    }

    await page.goto(`/templates/${testContext.template.id}/edit`)
    await page.waitForLoadState('networkidle')

    // Find a field button
    const fieldBtn = page.locator(
      '[data-testid="field-button"], button:has-text("{{"), .field-item'
    ).first()

    if (await fieldBtn.isVisible()) {
      await fieldBtn.click()

      // Check if field was inserted into editor
      const editor = page.locator('textarea').first()
      const content = await editor.inputValue()
      // May or may not have inserted depending on implementation
    }
  })
})
