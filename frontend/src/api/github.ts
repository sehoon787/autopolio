import apiClient from './client'

export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  clone_url: string
  language: string | null
  stargazers_count: number
  forks_count: number
  created_at: string
  updated_at: string
  pushed_at: string | null
}

// LLM-generated content types (v1.2)
export interface ImplementationDetail {
  title: string
  items: string[]
}

export interface DevelopmentTimelinePhase {
  period: string
  title: string
  activities: string[]
}

export interface DetailedAchievementItem {
  title: string
  description: string
}

export interface RepoAnalysis {
  id: number
  project_id: number
  git_url: string
  total_commits: number
  user_commits: number
  lines_added: number
  lines_deleted: number
  files_changed: number
  languages: Record<string, number>
  primary_language: string | null
  detected_technologies: string[]
  commit_messages_summary: string | null
  commit_categories: Record<string, number> | null
  architecture_patterns: string[] | null
  key_tasks: string[] | null  // LLM-generated key tasks
  // LLM-generated detailed content (v1.2)
  implementation_details: ImplementationDetail[] | null
  development_timeline: DevelopmentTimelinePhase[] | null
  tech_stack_versions: Record<string, string[]> | null
  detailed_achievements: Record<string, DetailedAchievementItem[]> | null
  analyzed_at: string
}

export interface RepoQuickInfo {
  name: string
  description: string | null
  html_url: string
  start_date: string | null
  end_date: string | null
  team_size: number
  contribution_percent: number
  total_commits: number
  user_commits: number
}

export interface AIGeneratedDescription {
  short_description: string | null
  description: string | null
  technologies: string[]
}

export interface GitHubStatus {
  connected: boolean
  github_username: string | null
  avatar_url: string | null
  valid: boolean
  message?: string
}

export interface FileTreeItem {
  type: 'file' | 'directory'
  name: string
  path: string
  size: number
  sha: string
  download_url?: string
}

export interface FileTreeResponse {
  files: FileTreeItem[]
  path: string
  git_url: string
}

export interface FileContentResponse {
  name: string
  path: string
  size: number
  sha: string
  content: string
  encoding: string
  download_url: string | null
}

// Batch import types
export interface ImportRepoResult {
  repo_url: string
  project_id?: number
  project_name: string
  success: boolean
  message: string
}

export interface ImportReposResponse {
  imported: number
  failed: number
  results: ImportRepoResult[]
}

export interface BatchAnalysisResult {
  project_id: number
  project_name: string
  success: boolean
  message: string
  detected_technologies?: string[]
  detected_role?: string
}

export interface BatchAnalysisResponse {
  task_id?: string
  total: number
  completed: number
  failed: number
  results: BatchAnalysisResult[]
}

// Inline editing types
export interface EditStatus {
  key_tasks_modified: boolean
  implementation_details_modified: boolean
  detailed_achievements_modified: boolean
}

export interface EffectiveRepoAnalysis extends RepoAnalysis {
  edit_status: EditStatus
}

export interface AnalysisContentUpdate {
  field: 'key_tasks' | 'implementation_details' | 'detailed_achievements'
  content: any
}

export interface AnalysisUpdateResponse {
  success: boolean
  field: string
  message: string
}

export const githubApi = {
  getStatus: (userId: number) =>
    apiClient.get<GitHubStatus>('/github/status', {
      params: { user_id: userId }
    }),

  connect: (redirectUrl?: string) =>
    apiClient.get<{ auth_url: string }>('/github/connect', {
      params: redirectUrl ? { redirect_url: redirectUrl } : {}
    }),

  disconnect: (userId: number) =>
    apiClient.delete('/github/disconnect', { params: { user_id: userId } }),

  getRepos: (userId: number, fetchAll: boolean = true) =>
    apiClient.get<{ repos: GitHubRepo[]; total: number; has_more: boolean }>('/github/repos', {
      params: { user_id: userId, fetch_all: fetchAll }
    }),

  analyzeRepo: (userId: number, gitUrl: string, projectId?: number) =>
    apiClient.post<RepoAnalysis>('/github/analyze', {
      git_url: gitUrl,
      project_id: projectId
    }, { params: { user_id: userId } }),

  getAnalysis: (projectId: number) =>
    apiClient.get<RepoAnalysis>(`/github/analysis/${projectId}`),

  getRepoInfo: (userId: number, gitUrl: string) =>
    apiClient.get<RepoQuickInfo>('/github/repo-info', {
      params: { user_id: userId, git_url: gitUrl }
    }),

  generateDescription: (userId: number, gitUrl: string) =>
    apiClient.post<AIGeneratedDescription>('/github/generate-description', {
      git_url: gitUrl
    }, { params: { user_id: userId } }),

  detectTechnologies: (userId: number, gitUrl: string) =>
    apiClient.get<{ technologies: string[] }>('/github/detect-technologies', {
      params: { user_id: userId, git_url: gitUrl }
    }),

  getFileTree: (userId: number, gitUrl: string, options?: {
    path?: string
    ref?: string
    recursive?: boolean
  }) =>
    apiClient.get<FileTreeResponse>('/github/file-tree', {
      params: {
        user_id: userId,
        git_url: gitUrl,
        path: options?.path || '',
        ref: options?.ref,
        recursive: options?.recursive || false
      }
    }),

  getFileContent: (userId: number, gitUrl: string, filePath: string, ref?: string) =>
    apiClient.get<FileContentResponse>('/github/file-content', {
      params: {
        user_id: userId,
        git_url: gitUrl,
        file_path: filePath,
        ref
      }
    }),

  // Batch operations
  importRepos: (userId: number, repoUrls: string[], autoAnalyze: boolean = false) =>
    apiClient.post<ImportReposResponse>('/github/import-repos', {
      repo_urls: repoUrls,
      auto_analyze: autoAnalyze
    }, { params: { user_id: userId } }),

  analyzeBatch: (userId: number, projectIds: number[]) =>
    apiClient.post<BatchAnalysisResponse>('/github/analyze-batch', {
      project_ids: projectIds
    }, { params: { user_id: userId } }),

  // Inline editing APIs
  getEffectiveAnalysis: (projectId: number) =>
    apiClient.get<EffectiveRepoAnalysis>(`/github/analysis/${projectId}/effective`),

  updateAnalysisContent: (projectId: number, update: AnalysisContentUpdate) =>
    apiClient.patch<AnalysisUpdateResponse>(`/github/analysis/${projectId}/content`, update),

  resetAnalysisField: (projectId: number, field: string) =>
    apiClient.post<AnalysisUpdateResponse>(`/github/analysis/${projectId}/reset/${field}`),
}
