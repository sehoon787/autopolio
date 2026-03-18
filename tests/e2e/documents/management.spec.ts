/**
 * E2E tests for document management.
 *
 * Selectors are based on the actual Documents page UI:
 * - Page heading: "Generated Documents" (h1)
 * - Empty state: "No documents generated" text + "Create First Document" button (links to /generate)
 * - "New Document" button in header (Plus icon, links to /generate)
 * - Document cards with: name (link), format badge (e.g. "DOCX"), status badge ("Completed"/"Draft"/"Archived"), date
 * - Action icon buttons per card: Eye (view), Download, Archive, Trash2 (delete)
 * - Bulk actions bar (when documents exist): "Select All"/"Deselect All", "Download Selected", "Delete Selected"
 * - Delete uses browser confirm() dialog
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  cleanupTestData,
  createApiContext,
  loginAsTestUser,
  TestDataContext,
} from '../fixtures/api-helpers'

test.describe('Document List Page', () => {
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

  test('should display documents page heading', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByRole('heading', { name: 'Generated Documents' })
    ).toBeVisible({ timeout: 10000 })
  })

  test('should show empty state when no documents', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Empty state text
    await expect(page.getByText('No documents generated')).toBeVisible({ timeout: 10000 })

    // "Create First Document" may be a button or a link
    const createBtn = page.getByRole('link', { name: 'Create First Document' })
      .or(page.getByRole('button', { name: 'Create First Document' }))
    await expect(createBtn.first()).toBeVisible({ timeout: 10000 })
  })

  test('should have New Document button in header', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('domcontentloaded')

    // "New Document" button links to /generate
    const newDocBtn = page.getByRole('link', { name: 'New Document' })
    await expect(newDocBtn).toBeVisible({ timeout: 10000 })
    await expect(newDocBtn).toHaveAttribute('href', '/generate')
  })

  test('should navigate to generate page from empty state button', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('domcontentloaded')

    // "Create First Document" is a link (wrapped in <Link to="/generate">)
    const createBtn = page.getByRole('link', { name: 'Create First Document' })
    await expect(createBtn).toBeVisible({ timeout: 10000 })
    await expect(createBtn).toHaveAttribute('href', '/generate')
  })

  test('should show subtitle text', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('domcontentloaded')

    await expect(
      page.getByText('Manage generated resume and portfolio documents.')
    ).toBeVisible({ timeout: 10000 })
  })
})
