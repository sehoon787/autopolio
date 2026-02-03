import apiClient from './client'

// Company types
export interface Company {
  id: number
  user_id: number
  name: string
  position: string | null
  department: string | null
  employment_type: string | null
  start_date: string | null
  end_date: string | null
  is_current: boolean
  description: string | null
  location: string | null
  company_url: string | null
  logo_path: string | null
  created_at: string
  updated_at: string
}

export interface CompanyCreate {
  name: string
  position?: string
  department?: string
  employment_type?: string
  start_date?: string
  end_date?: string
  is_current?: boolean
  description?: string
  location?: string
  company_url?: string
}

// Company Summary types
export interface ProjectSummary {
  id: number
  name: string
  start_date: string | null
  end_date: string | null
  role: string | null
  description: string | null
  git_url: string | null
  team_size: number | null
  technologies: string[]
}

export interface CompanySummaryResponse {
  company: Company
  projects: ProjectSummary[]
  project_count: number
  aggregated_tech_stack: string[]
  tech_categories: Record<string, string[]>
  date_range: string
}

export interface CompanyGroupedResponse {
  companies: CompanySummaryResponse[]
  total_companies: number
  total_projects: number
}

// Project types
export interface Technology {
  id: number
  name: string
  category: string | null
}

export interface Achievement {
  id: number
  project_id: number
  metric_name: string
  metric_value: string | null
  description: string | null
  category: string | null
  evidence: string | null
  display_order: number
  created_at: string
  updated_at: string
}

export interface Project {
  id: number
  user_id: number
  company_id: number | null
  name: string
  short_description: string | null
  description: string | null
  start_date: string | null
  end_date: string | null
  team_size: number | null
  role: string | null
  contribution_percent: number | null
  git_url: string | null
  project_type: string | null
  status: string | null
  links: Record<string, string> | null
  images: string[] | null
  is_analyzed: boolean
  ai_summary: string | null
  ai_key_features: string[] | null
  created_at: string
  updated_at: string
  technologies: Technology[]
  achievements: Achievement[]
}

export interface ProjectCreate {
  name: string
  short_description?: string
  description?: string
  start_date?: string
  end_date?: string
  team_size?: number
  role?: string
  contribution_percent?: number
  git_url?: string
  project_type?: string
  status?: string
  links?: Record<string, string>
  company_id?: number
  technologies?: string[]
}

export interface ProjectListResponse {
  projects: Project[]
  total: number
  page: number
  page_size: number
}

// API functions
export const companiesApi = {
  getAll: (userId: number) =>
    apiClient.get<Company[]>('/knowledge/companies', { params: { user_id: userId } }),

  getById: (userId: number, id: number) =>
    apiClient.get<Company>(`/knowledge/companies/${id}`, { params: { user_id: userId } }),

  create: (userId: number, data: CompanyCreate) =>
    apiClient.post<Company>('/knowledge/companies', data, { params: { user_id: userId } }),

  update: (userId: number, id: number, data: Partial<CompanyCreate>) =>
    apiClient.put<Company>(`/knowledge/companies/${id}`, data, { params: { user_id: userId } }),

  delete: (userId: number, id: number) =>
    apiClient.delete(`/knowledge/companies/${id}`, { params: { user_id: userId } }),

  getProjects: (userId: number, id: number) =>
    apiClient.get(`/knowledge/companies/${id}/projects`, { params: { user_id: userId } }),

  getSummary: (userId: number, id: number) =>
    apiClient.get<CompanySummaryResponse>(`/knowledge/companies/${id}/summary`, { params: { user_id: userId } }),

  getGroupedByCompany: (userId: number) =>
    apiClient.get<CompanyGroupedResponse>('/knowledge/companies/grouped-by-company', {
      params: { user_id: userId }
    }),

  linkProject: (userId: number, companyId: number, projectId: number) =>
    apiClient.post(`/knowledge/companies/${companyId}/link-project/${projectId}`, null, { params: { user_id: userId } }),

  unlinkProject: (userId: number, companyId: number, projectId: number) =>
    apiClient.delete(`/knowledge/companies/${companyId}/unlink-project/${projectId}`, { params: { user_id: userId } }),

  uploadLogo: (userId: number, companyId: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.post(`/knowledge/companies/${companyId}/logo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { user_id: userId },
    })
  },

  deleteLogo: (userId: number, companyId: number) =>
    apiClient.delete(`/knowledge/companies/${companyId}/logo`, { params: { user_id: userId } }),

  getLogoUrl: (userId: number, companyId: number) =>
    `/api/knowledge/companies/${companyId}/logo?user_id=${userId}`,
}

export interface ProjectFilters {
  company_id?: number
  project_type?: string
  is_analyzed?: boolean
  status?: string
  start_date_from?: string
  start_date_to?: string
  technologies?: string  // Comma separated
  search?: string
  sort_by?: string       // Comma separated sort fields (e.g., "is_analyzed,created_at")
  sort_order?: string    // Comma separated sort orders (e.g., "asc,desc")
  skip?: number
  limit?: number
}

export interface BatchDeleteResponse {
  deleted_count: number
  deleted_ids: number[]
  not_found_ids: number[]
}

export const projectsApi = {
  getAll: (userId: number, params?: ProjectFilters) =>
    apiClient.get<ProjectListResponse>('/knowledge/projects', {
      params: { user_id: userId, ...params }
    }),

  getById: (userId: number, id: number) =>
    apiClient.get<Project>(`/knowledge/projects/${id}`, { params: { user_id: userId } }),

  create: (userId: number, data: ProjectCreate) =>
    apiClient.post<Project>('/knowledge/projects', data, { params: { user_id: userId } }),

  update: (userId: number, id: number, data: Partial<ProjectCreate>) =>
    apiClient.put<Project>(`/knowledge/projects/${id}`, data, { params: { user_id: userId } }),

  delete: (userId: number, id: number) =>
    apiClient.delete(`/knowledge/projects/${id}`, { params: { user_id: userId } }),

  deleteBatch: (userId: number, projectIds: number[]) =>
    apiClient.delete<BatchDeleteResponse>('/knowledge/projects', {
      params: { user_id: userId, project_ids: projectIds },
      paramsSerializer: (params) => {
        const searchParams = new URLSearchParams()
        searchParams.append('user_id', String(params.user_id))
        params.project_ids.forEach((id: number) => {
          searchParams.append('project_ids', String(id))
        })
        return searchParams.toString()
      }
    }),

  getTechnologies: (category?: string) =>
    apiClient.get<Technology[]>('/knowledge/projects/technologies/list', {
      params: category ? { category } : {}
    }),

  createTechnology: (data: { name: string; category?: string }) =>
    apiClient.post<Technology>('/knowledge/projects/technologies', data),
}

export interface AutoDetectResponse {
  project_id: number
  detected_achievements: Array<{
    metric_name: string
    metric_value: string
    description?: string
    category?: string
    evidence?: string
    source?: string
  }>
  saved_achievements: Achievement[]
  stats: {
    pattern_detected: number
    code_stats_generated: number
    llm_generated: number
    total: number
  }
  message: string
}

export interface AutoDetectAllResponse {
  user_id: number
  projects_processed: number
  total_detected: number
  total_saved: number
  results: Array<{
    project_id: number
    project_name: string
    detected: number
    saved: number
  }>
}

export const achievementsApi = {
  getAll: (userId: number, projectId: number, category?: string) =>
    apiClient.get<Achievement[]>('/knowledge/achievements', {
      params: { user_id: userId, project_id: projectId, category }
    }),

  getById: (userId: number, id: number) =>
    apiClient.get<Achievement>(`/knowledge/achievements/${id}`, {
      params: { user_id: userId }
    }),

  create: (userId: number, projectId: number, data: Omit<Achievement, 'id' | 'project_id' | 'created_at' | 'updated_at'>) =>
    apiClient.post<Achievement>('/knowledge/achievements', data, {
      params: { user_id: userId, project_id: projectId }
    }),

  update: (userId: number, id: number, data: Partial<Achievement>) =>
    apiClient.put<Achievement>(`/knowledge/achievements/${id}`, data, {
      params: { user_id: userId }
    }),

  delete: (userId: number, id: number) =>
    apiClient.delete(`/knowledge/achievements/${id}`, {
      params: { user_id: userId }
    }),

  createBulk: (userId: number, projectId: number, data: Omit<Achievement, 'id' | 'project_id' | 'created_at' | 'updated_at'>[]) =>
    apiClient.post<Achievement[]>('/knowledge/achievements/bulk', data, {
      params: { user_id: userId, project_id: projectId }
    }),

  autoDetect: (userId: number, projectId: number, useLlm: boolean = true, saveToDb: boolean = true) =>
    apiClient.post<AutoDetectResponse>('/knowledge/achievements/auto-detect', null, {
      params: { user_id: userId, project_id: projectId, use_llm: useLlm, save_to_db: saveToDb }
    }),

  autoDetectAll: (userId: number, useLlm: boolean = false, saveToDb: boolean = true) =>
    apiClient.post<AutoDetectAllResponse>('/knowledge/achievements/auto-detect-all', null, {
      params: { user_id: userId, use_llm: useLlm, save_to_db: saveToDb }
    }),
}
