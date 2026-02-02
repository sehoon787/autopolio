import apiClient from './client'

// ===== Types =====

export interface PlatformInfo {
  key: string
  name: string
  name_en: string
  description: string
  description_en: string
  color: string
  features: string[]
  template_available: boolean
}

export interface PlatformTemplateListItem {
  id: number
  name: string
  platform_key: string
  description?: string
  platform_color?: string
  features?: string[]
  is_system: boolean
  created_at: string
}

export interface PlatformTemplateResponse {
  id: number
  user_id?: number
  name: string
  platform_key: string
  description?: string
  page_url?: string
  html_content?: string
  css_content?: string
  original_html?: string
  screenshot_path?: string
  field_mappings?: Record<string, unknown>
  selectors?: Record<string, unknown>
  is_system: boolean
  requires_login: boolean
  scrape_status?: string
  platform_color?: string
  platform_logo_url?: string
  features?: string[]
  created_at: string
  updated_at: string
}

export interface ExperienceData {
  company_name: string
  position?: string
  start_date?: string
  end_date?: string
  description?: string
  achievements?: string[]
}

export interface ProjectData {
  name: string
  company_name?: string
  start_date?: string
  end_date?: string
  description?: string
  role?: string
  technologies?: string[]
  achievements?: string[]
}

export interface SkillsData {
  languages?: string[]
  frameworks?: string[]
  databases?: string[]
  tools?: string[]
}

export interface EducationData {
  school_name: string
  major?: string
  start_date?: string
  end_date?: string
  description?: string
}

export interface CertificationData {
  name: string
  issuer?: string
  date?: string
}

export interface RenderDataRequest {
  name: string
  email?: string
  phone?: string
  photo_url?: string
  desired_position?: string
  summary?: string
  github_url?: string
  portfolio_url?: string
  experiences?: ExperienceData[]
  projects?: ProjectData[]
  skills?: SkillsData
  educations?: EducationData[]
  certifications?: CertificationData[]
}

export interface ExportResponse {
  filename: string
  download_url: string
  format: string
  size_bytes: number
}

// ===== API Functions =====

export const platformsApi = {
  // Platform Info
  getSupportedPlatforms: () =>
    apiClient.get<{ platforms: PlatformInfo[] }>('/platforms/info'),

  getFieldMappings: () =>
    apiClient.get<Record<string, unknown>>('/platforms/field-mappings'),

  // System Template Initialization
  initSystemTemplates: () =>
    apiClient.post<{ message: string; templates: { id: number; name: string; platform_key: string }[] }>(
      '/platforms/init-system'
    ),

  // Template CRUD
  getAll: (userId?: number) =>
    apiClient.get<{ templates: PlatformTemplateListItem[]; total: number }>(
      '/platforms',
      { params: userId ? { user_id: userId } : {} }
    ),

  getById: (templateId: number) =>
    apiClient.get<PlatformTemplateResponse>(`/platforms/${templateId}`),

  create: (data: {
    name: string
    platform_key: string
    description?: string
    html_content?: string
    css_content?: string
    platform_color?: string
    features?: string[]
  }, userId: number) =>
    apiClient.post<PlatformTemplateResponse>('/platforms', data, {
      params: { user_id: userId }
    }),

  update: (templateId: number, data: {
    name?: string
    description?: string
    html_content?: string
    css_content?: string
    features?: string[]
  }) =>
    apiClient.put<PlatformTemplateResponse>(`/platforms/${templateId}`, data),

  delete: (templateId: number) =>
    apiClient.delete(`/platforms/${templateId}`),

  // Rendering & Preview
  render: (templateId: number, data: RenderDataRequest) =>
    apiClient.post<{ html: string; generated_date: string }>(
      `/platforms/${templateId}/render`,
      data
    ),

  preview: (templateId: number, data: RenderDataRequest) =>
    apiClient.post<{ html: string }>(
      `/platforms/${templateId}/preview`,
      { data }
    ),

  previewWithSampleData: (templateId: number) =>
    apiClient.post<{ html: string }>(
      `/platforms/${templateId}/preview`,
      { use_sample_data: true }
    ),

  renderFromDb: (templateId: number, userId: number) =>
    apiClient.get<{ html: string; generated_date: string }>(
      `/platforms/${templateId}/render-from-db`,
      { params: { user_id: userId } }
    ),

  renderMarkdownFromDb: (templateId: number, userId: number) =>
    apiClient.get<{ markdown: string; generated_date: string }>(
      `/platforms/${templateId}/render-markdown-from-db`,
      { params: { user_id: userId } }
    ),

  previewMarkdownWithSampleData: (templateId: number) =>
    apiClient.get<{ markdown: string; generated_date: string }>(
      `/platforms/${templateId}/preview-markdown-sample`
    ),

  // Export (with user-provided data)
  exportToHtml: (templateId: number, data: RenderDataRequest) =>
    apiClient.post<ExportResponse>(
      `/platforms/${templateId}/export/html`,
      { data, format: 'html' }
    ),

  exportToMarkdown: (templateId: number, data: RenderDataRequest) =>
    apiClient.post<ExportResponse>(
      `/platforms/${templateId}/export/md`,
      { data, format: 'md' }
    ),

  exportToDocx: (templateId: number, data: RenderDataRequest) =>
    apiClient.post<ExportResponse>(
      `/platforms/${templateId}/export/docx`,
      { data, format: 'docx' }
    ),

  // Export from DB (using database data)
  exportFromDbToHtml: (templateId: number, userId: number) =>
    apiClient.post<ExportResponse>(
      `/platforms/${templateId}/export-from-db/html`,
      null,
      { params: { user_id: userId } }
    ),

  exportFromDbToMarkdown: (templateId: number, userId: number) =>
    apiClient.post<ExportResponse>(
      `/platforms/${templateId}/export-from-db/md`,
      null,
      { params: { user_id: userId } }
    ),

  exportFromDbToDocx: (templateId: number, userId: number) =>
    apiClient.post<ExportResponse>(
      `/platforms/${templateId}/export-from-db/docx`,
      null,
      { params: { user_id: userId } }
    ),

  // Download helper - returns the full download URL
  getDownloadUrl: (filename: string) => {
    const baseUrl = apiClient.defaults.baseURL || '/api'
    return `${baseUrl}/platforms/download/${filename}`
  }
}

export default platformsApi
