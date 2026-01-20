import apiClient from './client'

export interface Document {
  id: number
  user_id: number
  template_id: number | null
  job_id: number | null
  document_name: string
  description: string | null
  file_path: string
  file_format: string | null
  file_size: number | null
  included_projects: number[] | null
  included_companies: number[] | null
  generation_settings: Record<string, unknown> | null
  version: number
  parent_document_id: number | null
  status: string
  created_at: string
  updated_at: string
}

export interface DocumentPreview {
  document_id: number
  document_name: string
  format: string
  content: string | null
  preview_available: boolean
  message?: string
}

export interface DocumentVersion {
  id: number
  version: number
  document_name: string
  created_at: string
  status: string
}

export const documentsApi = {
  getAll: (userId: number, params?: {
    status?: string
    skip?: number
    limit?: number
  }) =>
    apiClient.get<{ documents: Document[]; total: number; page: number; page_size: number }>(
      '/documents',
      { params: { user_id: userId, ...params } }
    ),

  getById: (id: number) =>
    apiClient.get<Document>(`/documents/${id}`),

  download: (id: number) =>
    apiClient.get(`/documents/${id}/download`, { responseType: 'blob' }),

  getDownloadUrl: (id: number) => `/api/documents/${id}/download`,

  preview: (id: number) =>
    apiClient.get<DocumentPreview>(`/documents/${id}/preview`),

  delete: (id: number) =>
    apiClient.delete(`/documents/${id}`),

  archive: (id: number) =>
    apiClient.put<Document>(`/documents/${id}/archive`),

  getVersions: (id: number) =>
    apiClient.get<{ document_id: number; versions: DocumentVersion[]; total_versions: number }>(
      `/documents/${id}/versions`
    ),
}
