/**
 * Test data constants for E2E tests.
 */

export const TEST_USER = {
  name: 'E2E Test User',
  email: 'e2e-test@example.com',
}

export const TEST_COMPANY = {
  name: 'E2E Test Company',
  position: 'Software Engineer',
  department: 'Engineering',
  start_date: '2024-01-01',
  end_date: '2024-12-31',
  description: 'A test company for E2E testing',
}

export const TEST_PROJECT = {
  name: 'E2E Test Project',
  description: 'A test project for E2E testing with comprehensive features',
  role: 'Lead Developer',
  team_size: 5,
  project_type: 'company',
  start_date: '2024-01-01',
  end_date: '2024-06-30',
  technologies: ['Python', 'FastAPI', 'React', 'TypeScript', 'PostgreSQL'],
}

export const TEST_PERSONAL_PROJECT = {
  name: 'E2E Personal Project',
  description: 'A personal side project for testing',
  role: 'Solo Developer',
  team_size: 1,
  project_type: 'personal',
  start_date: '2024-03-01',
  technologies: ['TypeScript', 'Node.js', 'Express'],
}

export const TEST_CERTIFICATION = {
  name: 'AWS Solutions Architect',
  issuer: 'Amazon Web Services',
  issue_date: '2024-01-15',
  expiry_date: '2027-01-15',
  credential_id: 'AWS-SAA-12345',
}

export const TEST_EDUCATION = {
  school: 'Test University',
  degree: 'Bachelor of Science',
  field_of_study: 'Computer Science',
  start_date: '2016-03-01',
  end_date: '2020-02-28',
  gpa: 3.8,
}

export const TEST_AWARD = {
  title: 'Best Developer Award',
  issuer: 'Tech Conference 2024',
  date: '2024-06-15',
  description: 'Awarded for outstanding contributions to open source',
}

export const TEST_PUBLICATION = {
  title: 'Innovative System Design',
  publication_type: 'paper',
  publisher: 'IEEE',
  date: '2024-03-01',
  url: 'https://example.com/paper',
}

export const TEST_ACHIEVEMENT = {
  metric_name: 'Performance Improvement',
  metric_value: '50%',
  description: 'Improved API response time by 50% through optimization',
}

export const TEST_TEMPLATE = {
  name: 'E2E Test Template',
  platform: 'custom',
  template_content: `# {{name}}

## Summary
{{description}}

## Projects
{{#projects}}
### {{name}}
- **Role:** {{role}}
- **Period:** {{start_date}} - {{end_date}}
- **Technologies:** {{#technologies}}{{.}}, {{/technologies}}

{{description}}
{{/projects}}

## Skills
{{#skills}}
- {{.}}
{{/skills}}
`,
}

/**
 * Generate unique test data with timestamp suffix.
 */
export function generateUniqueTestData<T extends Record<string, unknown>>(
  baseData: T,
  uniqueFields: (keyof T)[]
): T {
  const timestamp = Date.now()
  const result = { ...baseData }

  for (const field of uniqueFields) {
    const value = result[field]
    if (typeof value === 'string') {
      result[field] = `${value} ${timestamp}` as T[keyof T]
    }
  }

  return result
}

/**
 * Generate unique email.
 */
export function generateUniqueEmail(prefix = 'test'): string {
  return `${prefix}_${Date.now()}@example.com`
}

/**
 * Wait helper for async operations.
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Selectors for common UI elements.
 */
export const SELECTORS = {
  // Navigation
  NAV_DASHBOARD: '[data-testid="nav-dashboard"], a[href="/dashboard"]',
  NAV_COMPANIES: '[data-testid="nav-companies"], a[href="/knowledge/companies"]',
  NAV_PROJECTS: '[data-testid="nav-projects"], a[href="/knowledge/projects"]',
  NAV_PLATFORMS: '[data-testid="nav-platforms"], a[href="/platforms"]',
  NAV_TEMPLATES: '[data-testid="nav-templates"], a[href="/templates"]',
  NAV_SETTINGS: '[data-testid="nav-settings"], a[href="/settings"]',

  // Buttons
  BTN_ADD: 'button:has-text("추가"), button:has-text("Add"), button:has-text("새로 만들기"), button:has-text("Create")',
  BTN_SAVE: 'button:has-text("저장"), button:has-text("Save")',
  BTN_CANCEL: 'button:has-text("취소"), button:has-text("Cancel")',
  BTN_DELETE: 'button:has-text("삭제"), button:has-text("Delete")',
  BTN_CONFIRM: 'button:has-text("확인"), button:has-text("Confirm"), button:has-text("OK")',
  BTN_EDIT: '[data-testid="edit-button"], button:has-text("편집"), button:has-text("Edit")',
  BTN_EXPORT: 'button:has-text("내보내기"), button:has-text("Export")',
  BTN_PREVIEW: 'button:has-text("미리보기"), button:has-text("Preview")',

  // Forms
  INPUT_NAME: 'input[name="name"]',
  INPUT_EMAIL: 'input[name="email"]',
  INPUT_POSITION: 'input[name="position"]',
  INPUT_DEPARTMENT: 'input[name="department"]',
  INPUT_DESCRIPTION: 'textarea[name="description"]',
  INPUT_START_DATE: 'input[name="start_date"], input[name="startDate"]',
  INPUT_END_DATE: 'input[name="end_date"], input[name="endDate"]',
  SELECT_COMPANY: 'select[name="company_id"], select[name="companyId"]',
  SELECT_PROJECT_TYPE: 'select[name="project_type"], select[name="projectType"]',

  // Lists and cards
  COMPANY_CARD: '[data-testid="company-card"]',
  PROJECT_CARD: '[data-testid="project-card"]',
  TEMPLATE_CARD: '[data-testid="template-card"]',
  PLATFORM_CARD: '[data-testid="platform-card"]',

  // Status indicators
  LOADING: '[data-testid="loading"], .loading, .spinner',
  ERROR: '[data-testid="error"], .error, [role="alert"]',
  SUCCESS: '[data-testid="success"], .success',

  // Modals
  MODAL: '[role="dialog"], .modal, [data-testid="modal"]',
  MODAL_CLOSE: '[data-testid="modal-close"], button[aria-label="Close"]',
}

/**
 * Common text patterns to look for (Korean and English).
 */
export const TEXT_PATTERNS = {
  SUCCESS: {
    SAVED: /저장되었습니다|Saved|Success/i,
    DELETED: /삭제되었습니다|Deleted/i,
    CREATED: /생성되었습니다|Created/i,
    UPDATED: /수정되었습니다|Updated/i,
  },
  ERROR: {
    REQUIRED: /필수|Required/i,
    INVALID: /유효하지 않|Invalid/i,
    NOT_FOUND: /찾을 수 없|Not found/i,
  },
  LOADING: {
    LOADING: /로딩|Loading/i,
    ANALYZING: /분석 중|Analyzing/i,
    GENERATING: /생성 중|Generating/i,
  },
}
