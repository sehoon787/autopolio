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

  getById: (id: number) =>
    apiClient.get<Company>(`/knowledge/companies/${id}`),

  create: (userId: number, data: CompanyCreate) =>
    apiClient.post<Company>('/knowledge/companies', data, { params: { user_id: userId } }),

  update: (id: number, data: Partial<CompanyCreate>) =>
    apiClient.put<Company>(`/knowledge/companies/${id}`, data),

  delete: (id: number) =>
    apiClient.delete(`/knowledge/companies/${id}`),

  getProjects: (id: number) =>
    apiClient.get(`/knowledge/companies/${id}/projects`),

  getSummary: (id: number) =>
    apiClient.get<CompanySummaryResponse>(`/knowledge/companies/${id}/summary`),

  getGroupedByCompany: (userId: number) =>
    apiClient.get<CompanyGroupedResponse>('/knowledge/companies/grouped-by-company', {
      params: { user_id: userId }
    }),
}

export const projectsApi = {
  getAll: (userId: number, params?: {
    company_id?: number
    project_type?: string
    is_analyzed?: boolean
    skip?: number
    limit?: number
  }) =>
    apiClient.get<ProjectListResponse>('/knowledge/projects', {
      params: { user_id: userId, ...params }
    }),

  getById: (id: number) =>
    apiClient.get<Project>(`/knowledge/projects/${id}`),

  create: (userId: number, data: ProjectCreate) =>
    apiClient.post<Project>('/knowledge/projects', data, { params: { user_id: userId } }),

  update: (id: number, data: Partial<ProjectCreate>) =>
    apiClient.put<Project>(`/knowledge/projects/${id}`, data),

  delete: (id: number) =>
    apiClient.delete(`/knowledge/projects/${id}`),

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
  getAll: (projectId: number, category?: string) =>
    apiClient.get<Achievement[]>('/knowledge/achievements', {
      params: { project_id: projectId, category }
    }),

  getById: (id: number) =>
    apiClient.get<Achievement>(`/knowledge/achievements/${id}`),

  create: (projectId: number, data: Omit<Achievement, 'id' | 'project_id' | 'created_at' | 'updated_at'>) =>
    apiClient.post<Achievement>('/knowledge/achievements', data, {
      params: { project_id: projectId }
    }),

  update: (id: number, data: Partial<Achievement>) =>
    apiClient.put<Achievement>(`/knowledge/achievements/${id}`, data),

  delete: (id: number) =>
    apiClient.delete(`/knowledge/achievements/${id}`),

  createBulk: (projectId: number, data: Omit<Achievement, 'id' | 'project_id' | 'created_at' | 'updated_at'>[]) =>
    apiClient.post<Achievement[]>('/knowledge/achievements/bulk', data, {
      params: { project_id: projectId }
    }),

  autoDetect: (projectId: number, useLlm: boolean = true, saveToDb: boolean = true) =>
    apiClient.post<AutoDetectResponse>('/knowledge/achievements/auto-detect', null, {
      params: { project_id: projectId, use_llm: useLlm, save_to_db: saveToDb }
    }),

  autoDetectAll: (userId: number, useLlm: boolean = false, saveToDb: boolean = true) =>
    apiClient.post<AutoDetectAllResponse>('/knowledge/achievements/auto-detect-all', null, {
      params: { user_id: userId, use_llm: useLlm, save_to_db: saveToDb }
    }),
}
