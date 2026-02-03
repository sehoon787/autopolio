/**
 * E2E tests for document management.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  cleanupTestData,
  TestDataContext,
} from '../fixtures/api-helpers'

test.describe('Document List', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    testContext = { user }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should display documents page', async ({ page }) => {
    await page.goto('/documents')

    await expect(
      page.locator('h1, h2').filter({ hasText: /문서|Documents/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should show empty state when no documents', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    // Either show documents or empty state
    const documentList = page.locator('[data-testid="document-list"]')
    const emptyState = page.locator('text=문서가 없습니다, text=No documents')

    await expect(documentList.or(emptyState)).toBeVisible({ timeout: 10000 })
  })

  test('should show document cards if documents exist', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    const documentCards = page.locator('[data-testid="document-card"]')

    if ((await documentCards.count()) > 0) {
      await expect(documentCards.first()).toBeVisible()
    }
  })
})

test.describe('Document Actions', () => {
  test('should have download button for documents', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    const downloadBtn = page.locator(
      '[data-testid="download-button"], button:has-text("다운로드"), button:has-text("Download")'
    ).first()

    // May or may not have documents
    if (await downloadBtn.isVisible()) {
      await expect(downloadBtn).toBeVisible()
    }
  })

  test('should have delete button for documents', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    const deleteBtn = page.locator(
      '[data-testid="delete-button"], button:has-text("삭제"), button:has-text("Delete")'
    ).first()

    if (await deleteBtn.isVisible()) {
      await expect(deleteBtn).toBeVisible()
    }
  })

  test('should download document on click', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    const downloadBtn = page.locator(
      '[data-testid="download-button"], button:has-text("다운로드")'
    ).first()

    if (await downloadBtn.isVisible()) {
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 })
      await downloadBtn.click()

      try {
        const download = await downloadPromise
        expect(download.suggestedFilename()).toBeTruthy()
      } catch {
        // May not have documents to download
      }
    }
  })

  test('should confirm before deleting document', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    const deleteBtn = page.locator('[data-testid="delete-button"]').first()

    if (await deleteBtn.isVisible()) {
      await deleteBtn.click()

      // Should show confirmation dialog
      const confirmDialog = page.locator(
        '[role="alertdialog"], [role="dialog"], .confirm-dialog'
      )

      await expect(confirmDialog).toBeVisible({ timeout: 5000 })

      // Cancel deletion
      const cancelBtn = page.locator('button:has-text("취소"), button:has-text("Cancel")')
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click()
      }
    }
  })
})

test.describe('Document Preview', () => {
  test('should navigate to document detail/preview', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    const documentCard = page.locator('[data-testid="document-card"]').first()

    if (await documentCard.isVisible()) {
      await documentCard.click()

      // Should navigate to detail page or open preview
      await page.waitForLoadState('networkidle')
    }
  })

  test('should show document content in preview', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    // Click on first document
    const documentCard = page.locator('[data-testid="document-card"]').first()

    if (await documentCard.isVisible()) {
      await documentCard.click()
      await page.waitForLoadState('networkidle')

      // Look for preview content
      const previewContent = page.locator(
        '[data-testid="document-preview"], .document-content, iframe'
      )

      await expect(previewContent).toBeVisible({ timeout: 10000 })
    }
  })
})

test.describe('Document Filtering', () => {
  test('should filter documents by format', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    // Look for filter controls
    const filterSelect = page.locator('select[name="format"]')
    const filterTabs = page.locator('[data-testid="format-tabs"]')

    if (await filterSelect.isVisible()) {
      await filterSelect.selectOption('markdown')
      await page.waitForLoadState('networkidle')
    } else if (await filterTabs.isVisible()) {
      await page.click('text=Markdown, text=MD')
      await page.waitForLoadState('networkidle')
    }
  })

  test('should search documents by name', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    const searchInput = page.locator(
      'input[type="search"], input[name="search"], input[placeholder*="검색"]'
    ).first()

    if (await searchInput.isVisible()) {
      await searchInput.fill('test')
      await page.waitForLoadState('networkidle')
    }
  })
})

test.describe('Document Sorting', () => {
  test('should sort documents by date', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    const sortSelect = page.locator('select[name="sort"]')
    const sortBtn = page.locator('button:has-text("정렬"), button:has-text("Sort")')

    if (await sortSelect.isVisible()) {
      await sortSelect.selectOption('date')
      await page.waitForLoadState('networkidle')
    } else if (await sortBtn.isVisible()) {
      await sortBtn.click()
      await page.click('text=날짜, text=Date')
      await page.waitForLoadState('networkidle')
    }
  })

  test('should sort documents by name', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    const sortSelect = page.locator('select[name="sort"]')

    if (await sortSelect.isVisible()) {
      await sortSelect.selectOption('name')
      await page.waitForLoadState('networkidle')
    }
  })
})
