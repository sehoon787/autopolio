import apiClient from './client'
import type { ImplementationDetail, DevelopmentTimelinePhase, DetailedAchievementItem } from './github'

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

// Project-specific report types
export interface DetailedReportData {
  report_type: 'detailed'
  project: {
    id: number
    name: string
    description: string | null
    role: string | null
    team_size: number | null
    start_date: string | null
    end_date: string
    date_range: string
  }
  company: {
    name: string
    position: string | null
  } | null
  repository: {
    name: string
    git_url: string
    total_commits: number
    user_commits: number
    contribution_percent: number
    lines_added: number
    lines_deleted: number
    net_lines: number
    files_changed: number
    analyzed_at: string | null
  }
  commit_analysis: {
    total_commits: number
    user_commits: number
    contribution_percent: number
    categories: Record<string, number>
    messages_summary: string
  }
  code_analysis: {
    lines_added: number
    lines_deleted: number
    net_change: number
    files_changed: number
  }
  languages: Array<{ name: string; percent: number }>
  technologies: string[]
  detected_technologies: string[]
  architecture_patterns: string[]
  key_tasks: string[]
  achievements_by_category: Record<string, Array<{
    metric_name: string
    metric_value: string | null
    description: string | null
    before_value?: string | null
    after_value?: string | null
  }>>
  // LLM-generated detailed content (v1.2)
  implementation_details?: ImplementationDetail[]
  development_timeline?: DevelopmentTimelinePhase[]
  tech_stack_versions?: Record<string, string[]>
  detailed_achievements?: Record<string, DetailedAchievementItem[]>
}

export interface FinalReportData {
  report_type: 'final'
  overview: {
    name: string
    date_range: string
    company: string
    role: string
    team_size: number | null
    description: string | null
  }
  technologies: string[]
  key_implementations: string[]
  achievements: Array<{
    metric_name: string
    metric_value: string | null
    description: string | null
    before_value?: string | null
    after_value?: string | null
  }>
  code_contribution: {
    lines_added: number
    lines_deleted: number
    net_lines: number
    files_changed: number
    commits: number
    contribution_percent: number
  } | null
  ai_summary: {
    summary: string | null
    key_features: string[] | null
  } | null
}

export interface PerformanceSummaryData {
  report_type: 'performance_summary'
  basic_info: {
    name: string
    date_range: string
    role: string
    team_size: number | null
    git_url: string | null
  }
  company: string
  technologies: string[]
  key_tasks: string[]
  achievements: Array<{
    metric_name: string
    metric_value: string | null
    description: string | null
    category: string | null
  }>
  commit_stats: {
    total_commits: number
    user_commits: number
    contribution_percent: number
    categories: Record<string, number>
  } | null
  code_stats: {
    lines_added: number
    lines_deleted: number
    files_changed: number
  } | null
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

  // Project-specific reports
  getDetailedReport: (projectId: number) =>
    apiClient.get<DetailedReportData>(`/documents/reports/project/${projectId}/detailed`),

  getFinalReport: (projectId: number) =>
    apiClient.get<FinalReportData>(`/documents/reports/project/${projectId}/final`),

  getPerformanceSummary: (projectId: number) =>
    apiClient.get<PerformanceSummaryData>(`/documents/reports/project/${projectId}/summary`),
}
