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
}
