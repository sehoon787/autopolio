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

export interface ReportResponse {
  report_type: string
  content: string
  format: string
}

export interface AllReportsResponse {
  reports: {
    projects_md: string
    performance_summary: string
    company_integrated: string
  }
  formats: string[]
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

export const reportsApi = {
  getProjectsReport: (userId: number) =>
    apiClient.get<ReportResponse>('/documents/reports/projects', {
      params: { user_id: userId }
    }),

  getPerformanceReport: (userId: number) =>
    apiClient.get<ReportResponse>('/documents/reports/performance', {
      params: { user_id: userId }
    }),

  getCompanyIntegratedReport: (userId: number) =>
    apiClient.get<ReportResponse>('/documents/reports/company-integrated', {
      params: { user_id: userId }
    }),

  getAllReports: (userId: number) =>
    apiClient.get<AllReportsResponse>('/documents/reports/all', {
      params: { user_id: userId }
    }),

  getDownloadUrl: (reportType: 'projects' | 'performance' | 'company-integrated', userId: number) =>
    `/api/documents/reports/download/${reportType}?user_id=${userId}`,
}
