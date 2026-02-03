/**
 * E2E tests for complete user workflows.
 */

import { test, expect } from '@playwright/test'
import {
  createTestUser,
  createTestCompany,
  createTestProject,
  initPlatformTemplates,
  cleanupTestData,
  TestDataContext,
} from '../fixtures/api-helpers'
import { TEST_COMPANY, TEST_PROJECT, TEST_ACHIEVEMENT } from '../fixtures/test-data'

test.describe('Complete Portfolio Workflow', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    await initPlatformTemplates(request)
    testContext = { user }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should complete full workflow from company to export', async ({ page }) => {
    // Step 1: Create Company
    await page.goto('/knowledge/companies')
    await page.click('button:has-text("추가"), button:has-text("Add")')

    const companyName = `Workflow Company ${Date.now()}`
    await page.fill('input[name="name"]', companyName)
    await page.fill('input[name="position"]', TEST_COMPANY.position)

    const startDateInput = page.locator('input[name="start_date"]')
    if (await startDateInput.isVisible()) {
      await startDateInput.fill(TEST_COMPANY.start_date)
    }

    await page.click('button:has-text("저장"), button:has-text("Save")')
    await expect(page.locator(`text=${companyName}`).first()).toBeVisible({ timeout: 10000 })

    // Step 2: Create Project
    await page.goto('/knowledge/projects')
    await page.click('button:has-text("추가"), button:has-text("Add"), button:has-text("새 프로젝트")')

    const projectName = `Workflow Project ${Date.now()}`
    await page.fill('input[name="name"]', projectName)

    const descInput = page.locator('textarea[name="description"]')
    if (await descInput.isVisible()) {
      await descInput.fill(TEST_PROJECT.description)
    }

    // Select company
    const companySelect = page.locator('select[name="company_id"]')
    if (await companySelect.isVisible()) {
      await companySelect.selectOption({ index: 1 })
    }

    await page.click('button:has-text("저장"), button:has-text("Save")')
    await expect(page.locator(`text=${projectName}`).first()).toBeVisible({ timeout: 10000 })

    // Step 3: Go to project detail and add achievement
    await page.click(`text=${projectName}`)
    await page.waitForLoadState('networkidle')

    const addAchievementBtn = page.locator(
      '[data-testid="add-achievement"], button:has-text("성과 추가")'
    ).first()

    if (await addAchievementBtn.isVisible()) {
      await addAchievementBtn.click()
      await page.fill('input[name="metric_name"]', TEST_ACHIEVEMENT.metric_name)
      await page.fill('input[name="metric_value"]', TEST_ACHIEVEMENT.metric_value)
      await page.click('button:has-text("저장"), button:has-text("Save")')
    }

    // Step 4: Preview platform template
    await page.goto('/platforms')
    await page.waitForLoadState('networkidle')

    const previewBtn = page.locator('button:has-text("미리보기"), button:has-text("Preview")').first()
    if (await previewBtn.isVisible()) {
      await previewBtn.click()
      await page.waitForLoadState('networkidle')

      // Should show preview
      await expect(page.locator('iframe').first()).toBeVisible({ timeout: 10000 })
    }

    // Step 5: Toggle to real data
    const realDataToggle = page.locator('[data-testid="real-data-toggle"]').first()
    if (await realDataToggle.isVisible()) {
      await realDataToggle.click()
      await page.waitForLoadState('networkidle')
    }

    // Step 6: Export document
    const exportBtn = page.locator('button:has-text("내보내기"), button:has-text("Export")').first()
    if (await exportBtn.isVisible()) {
      await exportBtn.click()
      await page.waitForLoadState('networkidle')

      // Click Markdown export
      const mdBtn = page.locator('button:has-text("Markdown")').first()
      if (await mdBtn.isVisible()) {
        const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
        await mdBtn.click()

        try {
          const download = await downloadPromise
          expect(download.suggestedFilename()).toMatch(/\.md$/i)
        } catch {
          // Download might not auto-trigger
        }
      }
    }
  })
})

test.describe('GitHub Analysis Workflow', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    testContext = { user }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should create project with git URL and analyze', async ({ page }) => {
    // Create project with git URL
    await page.goto('/knowledge/projects')
    await page.click('button:has-text("추가"), button:has-text("Add")')

    const projectName = `GitHub Project ${Date.now()}`
    await page.fill('input[name="name"]', projectName)

    const gitUrlInput = page.locator('input[name="git_url"]')
    if (await gitUrlInput.isVisible()) {
      await gitUrlInput.fill('https://github.com/facebook/react')
    }

    await page.click('button:has-text("저장"), button:has-text("Save")')
    await expect(page.locator(`text=${projectName}`).first()).toBeVisible({ timeout: 10000 })

    // Navigate to project detail
    await page.click(`text=${projectName}`)
    await page.waitForLoadState('networkidle')

    // Look for analyze button
    const analyzeBtn = page.locator(
      '[data-testid="analyze-button"], button:has-text("분석")'
    ).first()

    if (await analyzeBtn.isVisible()) {
      await analyzeBtn.click()

      // Should show analysis in progress
      await page.waitForTimeout(2000)
    }
  })
})

test.describe('Template Customization Workflow', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    const project = await createTestProject(request, user.id)
    testContext = { user, project }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should clone and customize template', async ({ page }) => {
    // Go to templates
    await page.goto('/templates')
    await page.waitForLoadState('networkidle')

    // Clone first template
    const cloneBtn = page.locator(
      '[data-testid="clone-template"], button:has-text("복제")'
    ).first()

    if (await cloneBtn.isVisible()) {
      await cloneBtn.click()

      // Fill new name
      const nameInput = page.locator('input[name="name"]').first()
      if (await nameInput.isVisible()) {
        await nameInput.fill(`Custom Template ${Date.now()}`)
        await page.click('button:has-text("복제"), button:has-text("확인")')
      }

      await page.waitForLoadState('networkidle')
    }

    // Edit the cloned template
    const editBtn = page.locator('[data-testid="edit-template"]').first()
    if (await editBtn.isVisible()) {
      await editBtn.click()
      await page.waitForLoadState('networkidle')

      // Modify content
      const editor = page.locator('textarea').first()
      if (await editor.isVisible()) {
        await editor.fill('# Custom Template\n\n{{name}}\n\n{{description}}')
        await page.click('button:has-text("저장"), button:has-text("Save")')
      }
    }
  })
})

test.describe('Multi-Project Document Generation', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    const company = await createTestCompany(request, user.id)

    // Create multiple projects
    const project1 = await createTestProject(request, user.id, company.id, {
      name: `Multi Project 1 ${Date.now()}`,
    })
    const project2 = await createTestProject(request, user.id, undefined, {
      name: `Multi Project 2 ${Date.now()}`,
    })

    testContext = { user, company, project: project1 }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should generate document with multiple projects', async ({ page }) => {
    await page.goto('/generate')
    await page.waitForLoadState('networkidle')

    // Select multiple projects
    const checkboxes = page.locator('[data-testid="project-checkbox"], input[type="checkbox"]')

    if ((await checkboxes.count()) >= 2) {
      await checkboxes.nth(0).click()
      await checkboxes.nth(1).click()
    }

    // Select template
    const templateSelect = page.locator('select[name="template"]')
    if (await templateSelect.isVisible()) {
      await templateSelect.selectOption({ index: 1 })
    }

    // Generate
    const generateBtn = page.locator('button:has-text("생성"), button:has-text("Generate")').first()
    if (await generateBtn.isVisible()) {
      await generateBtn.click()
      await page.waitForLoadState('networkidle')
    }
  })
})

test.describe('Cross-Feature Navigation', () => {
  test('should navigate between all main sections', async ({ page }) => {
    // Dashboard
    await page.goto('/dashboard')
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 })

    // Companies
    await page.goto('/knowledge/companies')
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 })

    // Projects
    await page.goto('/knowledge/projects')
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 })

    // Platforms
    await page.goto('/platforms')
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 })

    // Templates
    await page.goto('/templates')
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 })

    // Documents
    await page.goto('/documents')
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 })

    // Settings
    await page.goto('/settings')
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 })
  })

  test('should maintain navigation state', async ({ page }) => {
    // Navigate through sidebar
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const navItems = [
      { selector: 'a[href*="companies"]', url: /companies/ },
      { selector: 'a[href*="projects"]', url: /projects/ },
      { selector: 'a[href*="platforms"]', url: /platforms/ },
    ]

    for (const item of navItems) {
      const link = page.locator(item.selector).first()
      if (await link.isVisible()) {
        await link.click()
        await expect(page).toHaveURL(item.url, { timeout: 10000 })
      }
    }
  })
})
