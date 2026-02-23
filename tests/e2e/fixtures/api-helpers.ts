/**
 * API helper functions for E2E tests.
 * Uses Playwright's request context to make API calls.
 */

import { APIRequestContext, request as playwrightRequest, Page } from '@playwright/test'
import {
  TEST_USER,
  TEST_COMPANY,
  TEST_PROJECT,
  TEST_PERSONAL_PROJECT,
  TEST_CERTIFICATION,
  TEST_EDUCATION,
  generateUniqueEmail,
} from './test-data'

import { API_BASE_URL } from '../runtimeConfig'

const API_BASE = API_BASE_URL

// ==================== Standalone Request Context ====================

/**
 * Creates a standalone API request context for use in beforeAll/afterAll hooks.
 * Must be disposed after use with request.dispose()
 */
export async function createApiContext(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL: API_BASE.replace('/api', ''),
  })
}

// ==================== Browser Auth ====================

/**
 * Sets up browser localStorage so the frontend recognizes the test user.
 * Must be called BEFORE page.goto() to any page that requires user context.
 * Uses addInitScript so it runs on every subsequent navigation in the test.
 */
export async function loginAsTestUser(page: Page, user: TestUser): Promise<void> {
  await page.addInitScript(({ id, name, email }) => {
    localStorage.setItem('user_id', String(id))
    localStorage.setItem('user-storage', JSON.stringify({
      state: { user: { id, name, email }, isGuest: false },
      version: 0,
    }))
  }, { id: user.id, name: user.name, email: user.email })
}

// ==================== Users ====================

export interface TestUser {
  id: number
  name: string
  email: string
}

export async function createTestUser(
  request: APIRequestContext,
  overrides: Partial<typeof TEST_USER> = {}
): Promise<TestUser> {
  const response = await request.post(`${API_BASE}/users`, {
    data: {
      name: TEST_USER.name,
      email: generateUniqueEmail('e2e'),
      ...overrides,
    },
  })

  if (!response.ok()) {
    throw new Error(`Failed to create user: ${response.status()} ${await response.text()}`)
  }

  return response.json()
}

export async function getOrCreateTestUser(
  request: APIRequestContext,
  email: string
): Promise<TestUser> {
  const response = await request.post(`${API_BASE}/users/get-or-create`, {
    data: {
      email,
      name: TEST_USER.name,
    },
  })

  if (!response.ok()) {
    throw new Error(`Failed to get or create user: ${response.status()}`)
  }

  return response.json()
}

export async function deleteTestUser(
  request: APIRequestContext,
  userId: number
): Promise<void> {
  await request.delete(`${API_BASE}/users/${userId}`)
}

// ==================== Companies ====================

export interface TestCompany {
  id: number
  user_id: number
  name: string
  position: string
  department?: string
  start_date?: string
  end_date?: string
}

export async function createTestCompany(
  request: APIRequestContext,
  userId: number,
  overrides: Partial<typeof TEST_COMPANY> = {}
): Promise<TestCompany> {
  const timestamp = Date.now()
  // user_id is a query parameter, not body data
  const response = await request.post(`${API_BASE}/knowledge/companies?user_id=${userId}`, {
    data: {
      name: `${TEST_COMPANY.name} ${timestamp}`,
      position: TEST_COMPANY.position,
      department: TEST_COMPANY.department,
      start_date: TEST_COMPANY.start_date,
      ...overrides,
    },
  })

  if (!response.ok()) {
    throw new Error(`Failed to create company: ${response.status()} ${await response.text()}`)
  }

  return response.json()
}

export async function deleteTestCompany(
  request: APIRequestContext,
  companyId: number
): Promise<void> {
  await request.delete(`${API_BASE}/knowledge/companies/${companyId}`)
}

// ==================== Projects ====================

export interface TestProjectData {
  id: number
  user_id: number
  company_id?: number
  name: string
  description?: string
  role?: string
  project_type: string
}

export async function createTestProject(
  request: APIRequestContext,
  userId: number,
  companyId?: number,
  overrides: Partial<typeof TEST_PROJECT> = {}
): Promise<TestProjectData> {
  const timestamp = Date.now()
  const projectData = companyId ? TEST_PROJECT : TEST_PERSONAL_PROJECT

  // user_id is a query parameter, not body data
  const response = await request.post(`${API_BASE}/knowledge/projects?user_id=${userId}`, {
    data: {
      company_id: companyId,
      name: `${projectData.name} ${timestamp}`,
      description: projectData.description,
      role: projectData.role,
      team_size: projectData.team_size,
      project_type: companyId ? 'company' : 'personal',
      start_date: projectData.start_date,
      technologies: projectData.technologies,
      ...overrides,
    },
  })

  if (!response.ok()) {
    throw new Error(`Failed to create project: ${response.status()} ${await response.text()}`)
  }

  return response.json()
}

export async function deleteTestProject(
  request: APIRequestContext,
  projectId: number
): Promise<void> {
  await request.delete(`${API_BASE}/knowledge/projects/${projectId}`)
}

// ==================== Credentials ====================

export async function createTestCertification(
  request: APIRequestContext,
  userId: number,
  overrides: Partial<typeof TEST_CERTIFICATION> = {}
): Promise<{ id: number; name: string }> {
  const timestamp = Date.now()
  // user_id is a query parameter, not body data
  const response = await request.post(`${API_BASE}/knowledge/credentials/certifications?user_id=${userId}`, {
    data: {
      name: `${TEST_CERTIFICATION.name} ${timestamp}`,
      issuer: TEST_CERTIFICATION.issuer,
      issue_date: TEST_CERTIFICATION.issue_date,
      ...overrides,
    },
  })

  if (!response.ok()) {
    throw new Error(`Failed to create certification: ${response.status()}`)
  }

  return response.json()
}

export async function createTestEducation(
  request: APIRequestContext,
  userId: number,
  overrides: Partial<typeof TEST_EDUCATION> = {}
): Promise<{ id: number }> {
  const timestamp = Date.now()
  // user_id is a query parameter, not body data
  const response = await request.post(`${API_BASE}/knowledge/credentials/educations?user_id=${userId}`, {
    data: {
      school_name: `${TEST_EDUCATION.school} ${timestamp}`,
      degree: TEST_EDUCATION.degree,
      field_of_study: TEST_EDUCATION.field_of_study,
      start_date: TEST_EDUCATION.start_date,
      end_date: TEST_EDUCATION.end_date,
      ...overrides,
    },
  })

  if (!response.ok()) {
    throw new Error(`Failed to create education: ${response.status()}`)
  }

  return response.json()
}

// ==================== Templates ====================

export async function createTestTemplate(
  request: APIRequestContext,
  userId: number,
  overrides: Record<string, unknown> = {}
): Promise<{ id: number; name: string }> {
  const timestamp = Date.now()
  // user_id is a query parameter, not body data
  const response = await request.post(`${API_BASE}/templates?user_id=${userId}`, {
    data: {
      name: `Test Template ${timestamp}`,
      platform: 'custom',
      template_content: '# {{name}}\n\n{{description}}',
      ...overrides,
    },
  })

  if (!response.ok()) {
    throw new Error(`Failed to create template: ${response.status()}`)
  }

  return response.json()
}

export async function deleteTestTemplate(
  request: APIRequestContext,
  templateId: number
): Promise<void> {
  await request.delete(`${API_BASE}/templates/${templateId}`)
}

// ==================== Platforms ====================

export async function initPlatformTemplates(
  request: APIRequestContext
): Promise<void> {
  await request.post(`${API_BASE}/platforms/init-system`)
}

export async function getPlatformTemplates(
  request: APIRequestContext
): Promise<{ id: number; name: string; platform_name: string }[]> {
  const response = await request.get(`${API_BASE}/platforms`)
  if (!response.ok()) {
    throw new Error(`Failed to get platforms: ${response.status()}`)
  }
  return response.json()
}

// ==================== Cleanup ====================

export interface TestDataContext {
  user?: TestUser
  company?: TestCompany
  project?: TestProjectData
  template?: { id: number }
}

export async function cleanupTestData(
  request: APIRequestContext,
  context?: TestDataContext
): Promise<void> {
  // Handle undefined context (when beforeAll fails)
  if (!context) {
    return
  }

  // Delete in reverse order of dependencies
  if (context.template?.id) {
    await request.delete(`${API_BASE}/templates/${context.template.id}`).catch(() => {})
  }

  if (context.project?.id) {
    await request.delete(`${API_BASE}/knowledge/projects/${context.project.id}`).catch(() => {})
  }

  if (context.company?.id) {
    await request.delete(`${API_BASE}/knowledge/companies/${context.company.id}`).catch(() => {})
  }

  if (context.user?.id) {
    await request.delete(`${API_BASE}/users/${context.user.id}`).catch(() => {})
  }
}

// ==================== Full Setup ====================

export async function setupFullTestData(
  request: APIRequestContext
): Promise<TestDataContext> {
  const user = await createTestUser(request)
  const company = await createTestCompany(request, user.id)
  const project = await createTestProject(request, user.id, company.id)

  return { user, company, project }
}

// ==================== API Response Helpers ====================

export async function expectApiSuccess(
  response: { ok(): boolean; status(): number; text(): Promise<string> }
): Promise<void> {
  if (!response.ok()) {
    const text = await response.text()
    throw new Error(`API request failed: ${response.status()} - ${text}`)
  }
}

export async function getApiJson<T>(
  request: APIRequestContext,
  path: string
): Promise<T> {
  const response = await request.get(`${API_BASE}${path}`)
  await expectApiSuccess(response)
  return response.json()
}

export async function postApiJson<T>(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>
): Promise<T> {
  const response = await request.post(`${API_BASE}${path}`, { data })
  await expectApiSuccess(response)
  return response.json()
}
