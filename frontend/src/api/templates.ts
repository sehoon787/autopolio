import apiClient from './client'

export interface Template {
  id: number
  user_id: number | null
  name: string
  description: string | null
  platform: string | null
  is_system: boolean
  output_format: string
  template_content: string | null
  template_file_path: string | null
  field_mappings: Record<string, string> | null
  sections: string[] | null
  style_settings: Record<string, unknown> | null
  max_projects: number | null
  max_characters: number | null
  created_at: string
  updated_at: string
}

export interface TemplateCreate {
  name: string
  description?: string
  platform?: string
  output_format?: string
  template_content?: string
  field_mappings?: Record<string, string>
  sections?: string[]
  style_settings?: Record<string, unknown>
  max_projects?: number
  max_characters?: number
}

export interface TemplatePreviewRequest {
  template_content: string
  sample_data?: Record<string, unknown>
}

export interface TemplatePreviewResponse {
  preview_html: string
  preview_text: string
  fields_used: string[]
}

export interface FieldInfo {
  field: string
  description: string
  example?: string
  is_section?: boolean
  parent?: string
}

export interface AvailableFieldsResponse {
  user_fields: FieldInfo[]
  company_fields: FieldInfo[]
  project_fields: FieldInfo[]
  achievement_fields: FieldInfo[]
  syntax_guide: {
    simple_field: string
    section_start: string
    section_end: string
    example: string
  }
}

export interface PlatformConfig {
  name: string
  max_projects: number | null
  fields: string[]
}

export const templatesApi = {
  getAll: (userId?: number, platform?: string, includeSystem: boolean = true) =>
    apiClient.get<{ templates: Template[]; total: number }>('/templates', {
      params: { user_id: userId, platform, include_system: includeSystem }
    }),

  getById: (id: number) =>
    apiClient.get<Template>(`/templates/${id}`),

  getPlatforms: () =>
    apiClient.get<Record<string, PlatformConfig>>('/templates/platforms'),

  create: (userId: number, data: TemplateCreate) =>
    apiClient.post<Template>('/templates', data, { params: { user_id: userId } }),

  upload: (userId: number, file: File, name: string, platform: string = 'custom') => {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.post<Template>('/templates/upload', formData, {
      params: { user_id: userId, name, platform },
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },

  update: (id: number, data: Partial<TemplateCreate>) =>
    apiClient.put<Template>(`/templates/${id}`, data),

  delete: (id: number) =>
    apiClient.delete(`/templates/${id}`),

  initSystemTemplates: () =>
    apiClient.post('/templates/init-system-templates'),

  clone: (templateId: number, userId: number, newName?: string) =>
    apiClient.post<Template>(`/templates/${templateId}/clone`, null, {
      params: { user_id: userId, new_name: newName }
    }),

  preview: (data: TemplatePreviewRequest, userId?: number) =>
    apiClient.post<TemplatePreviewResponse>('/templates/preview', data, {
      params: userId ? { user_id: userId } : {}
    }),

  getAvailableFields: () =>
    apiClient.get<AvailableFieldsResponse>('/templates/fields/available'),
}
