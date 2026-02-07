import apiClient, { ANALYSIS_TIMEOUT } from './client'

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
  fork: boolean
  owner: string
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
  // AI-generated summary (v1.12 - generated during analysis)
  ai_summary?: string | null
  ai_key_features?: string[] | null
  // User's code contributions context (v1.12)
  user_code_contributions?: {
    summary?: {
      total_commits?: number
      analyzed_commits?: number
      lines_added?: number
      lines_deleted?: number
      files_changed?: number
    }
    technologies?: string[]
    work_areas?: string[]
  } | null
  analyzed_at: string
  // LLM usage tracking (v1.8)
  provider?: string | null
  token_usage?: number | null
  // Auto-calculated contribution percent (v1.12)
  suggested_contribution_percent?: number | null
  // Language used for analysis (v1.12)
  analysis_language?: string  // "ko" or "en"
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

// ============ Extended Analysis Types (v1.10) ============

export interface DetailedCommit {
  sha: string
  short_sha: string
  message: string
  full_message?: string
  author: string
  author_email?: string
  date: string
  commit_type: string  // feat, fix, refactor, docs, test, chore, perf, style, other
  type_label: string  // Human-readable label
  scope?: string
  description: string
  is_breaking: boolean
  files_changed: number
  lines_added: number
  lines_deleted: number
  work_areas: string[]  // ["frontend", "backend", "tests", ...]
}

export interface ContributorSummary {
  username: string
  avatar_url?: string
  contributions: number
  html_url?: string
}

export interface ContributorAnalysis {
  username: string
  email?: string
  is_primary: boolean
  total_commits: number
  first_commit_date?: string
  last_commit_date?: string
  lines_added: number
  lines_deleted: number
  file_extensions: Record<string, number>  // {".py": 45, ".ts": 30}
  work_areas: string[]  // ["frontend", "backend", "tests"]
  detected_technologies: string[]
  detailed_commits: DetailedCommit[]
  commit_types: Record<string, number>  // {"feat": 40, "fix": 30}
}

export interface FileCountByType {
  code: number
  test: number
  docs: number
  config: number
}

export interface CodeQualityMetrics {
  total_files: number
  total_lines: number  // Estimated
  avg_file_size: number
  max_file_size: number
  test_file_ratio: number  // Percentage of test files
  doc_file_ratio: number  // Percentage of doc files
  code_file_ratio: number  // Percentage of code files
  config_file_count: number
  language_distribution: Record<string, number>  // {".py": 45.5, ".ts": 30.2}
  file_count_by_type: FileCountByType
}

export interface ContributorsListResponse {
  contributors: ContributorSummary[]
  total: number
}

export interface DetailedCommitsResponse {
  commits: DetailedCommit[]
  total: number
  author?: string
}

export interface ExtendedRepoAnalysis extends RepoAnalysis {
  repo_technologies: string[]
  all_contributors: ContributorSummary[]
  code_quality_metrics?: CodeQualityMetrics
  contributors: ContributorAnalysis[]
  primary_contributor?: ContributorAnalysis
}

// ============ Background Analysis Types (v1.12) ============

export interface AnalysisJobStatus {
  task_id: string
  project_id: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  current_step: number
  total_steps: number
  step_name?: string
  error_message?: string
  partial_results?: Record<string, any>
  started_at?: string
  completed_at?: string
  created_at: string
  token_usage?: number  // Total tokens used in LLM calls
  llm_provider?: string  // LLM provider used (e.g., 'openai', 'anthropic', 'claude_code', 'gemini_cli')
}

export interface AnalysisJobListResponse {
  jobs: AnalysisJobStatus[]
  total: number
}

export interface StartAnalysisResponse {
  task_id: string
  project_id: number
  message: string
}

export interface CancelAnalysisResponse {
  task_id: string
  project_id: number
  status: string
  message: string
  partial_saved: boolean
}

export const githubApi = {
  getStatus: (userId: number) =>
    apiClient.get<GitHubStatus>('/github/status', {
      params: { user_id: userId }
    }),

  connect: (redirectUrl?: string, isElectron?: boolean, userId?: number) =>
    apiClient.get<{ auth_url: string }>('/github/connect', {
      params: {
        redirect_url: redirectUrl,
        frontend_origin: window.location.origin,  // Pass current origin for dynamic redirect
        is_electron: isElectron || false,  // Use custom protocol for Electron OAuth callback
        user_id: userId  // Link GitHub to existing user instead of creating new one
      }
    }),

  disconnect: (userId: number) =>
    apiClient.delete('/github/disconnect', { params: { user_id: userId } }),

  getRepos: (userId: number, fetchAll: boolean = true) =>
    apiClient.get<{ repos: GitHubRepo[]; total: number; has_more: boolean }>('/github/repos', {
      params: { user_id: userId, fetch_all: fetchAll }
    }),

  analyzeRepo: (
    userId: number,
    gitUrl: string,
    projectId?: number,
    options?: {
      provider?: string
      cli_mode?: 'claude_code' | 'gemini_cli'
      cli_model?: string
      language?: 'ko' | 'en'  // Analysis language (v1.12)
    }
  ) =>
    apiClient.post<RepoAnalysis>('/github/analyze', {
      git_url: gitUrl,
      project_id: projectId
    }, {
      timeout: ANALYSIS_TIMEOUT,  // Extended timeout for CLI/LLM analysis
      params: {
        user_id: userId,
        provider: options?.provider,
        cli_mode: options?.cli_mode,
        cli_model: options?.cli_model,
        language: options?.language  // Pass analysis language
      }
    }),

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

  analyzeBatch: (
    userId: number,
    projectIds: number[],
    options?: {
      llm_provider?: string
      cli_mode?: 'claude_code' | 'gemini_cli'
      cli_model?: string
    }
  ) =>
    apiClient.post<BatchAnalysisResponse>('/github/analyze-batch', {
      project_ids: projectIds,
      llm_provider: options?.llm_provider,
      cli_mode: options?.cli_mode,
      cli_model: options?.cli_model
    }, {
      timeout: ANALYSIS_TIMEOUT * projectIds.length,  // Extended timeout based on project count
      params: { user_id: userId }
    }),

  // Inline editing APIs
  getEffectiveAnalysis: (projectId: number) =>
    apiClient.get<EffectiveRepoAnalysis>(`/github/analysis/${projectId}/effective`),

  updateAnalysisContent: (projectId: number, update: AnalysisContentUpdate) =>
    apiClient.patch<AnalysisUpdateResponse>(`/github/analysis/${projectId}/content`, update),

  resetAnalysisField: (projectId: number, field: string) =>
    apiClient.post<AnalysisUpdateResponse>(`/github/analysis/${projectId}/reset/${field}`),

  // Extended analysis APIs (v1.10)
  getContributors: (projectId: number, userId: number) =>
    apiClient.get<ContributorsListResponse>(`/github/contributors/${projectId}`, {
      params: { user_id: userId }
    }),

  getContributorAnalysis: (
    projectId: number,
    userId: number,
    options?: {
      username?: string
      refresh?: boolean
    }
  ) =>
    apiClient.get<ContributorAnalysis>(`/github/contributor-analysis/${projectId}`, {
      params: {
        user_id: userId,
        username: options?.username,
        refresh: options?.refresh || false
      },
      timeout: ANALYSIS_TIMEOUT  // Extended timeout for fresh analysis
    }),

  getCodeQuality: (projectId: number, userId: number) =>
    apiClient.get<CodeQualityMetrics>(`/github/code-quality/${projectId}`, {
      params: { user_id: userId }
    }),

  getDetailedCommits: (
    projectId: number,
    userId: number,
    options?: {
      author?: string
      limit?: number
    }
  ) =>
    apiClient.get<DetailedCommitsResponse>(`/github/detailed-commits/${projectId}`, {
      params: {
        user_id: userId,
        author: options?.author,
        limit: options?.limit || 50
      }
    }),

  // ============ Background Analysis APIs (v1.12) ============

  startBackgroundAnalysis: (
    userId: number,
    gitUrl: string,
    projectId?: number,
    options?: {
      provider?: string
      cli_mode?: 'claude_code' | 'gemini_cli'
      cli_model?: string
      language?: 'ko' | 'en'  // Analysis language (v1.12)
    }
  ) =>
    apiClient.post<StartAnalysisResponse>('/github/analyze-background', {
      git_url: gitUrl,
      project_id: projectId
    }, {
      params: {
        user_id: userId,
        provider: options?.provider,
        cli_mode: options?.cli_mode,
        cli_model: options?.cli_model,
        language: options?.language  // Pass analysis language
      }
    }),

  getActiveAnalyses: (userId: number) =>
    apiClient.get<AnalysisJobListResponse>('/github/active-analyses', {
      params: { user_id: userId }
    }),

  getAnalysisStatus: (projectId: number, userId: number) =>
    apiClient.get<AnalysisJobStatus | null>(`/github/analysis-status/${projectId}`, {
      params: { user_id: userId }
    }),

  cancelAnalysis: (projectId: number, userId: number) =>
    apiClient.post<CancelAnalysisResponse>(`/github/analysis/${projectId}/cancel`, null, {
      params: { user_id: userId }
    }),

  getJobStatus: (taskId: string, userId: number) =>
    apiClient.get<AnalysisJobStatus>(`/github/job/${taskId}`, {
      params: { user_id: userId }
    }),

  // Save GitHub token (used by Electron desktop app via gh CLI)
  saveToken: (userId: number, token: string) =>
    apiClient.post<{
      success: boolean
      message: string
      user_id: number  // The actual user_id where token was saved (may differ due to merge)
      github_username?: string
      github_avatar_url?: string
      merged_from_user_id?: number  // If token was merged to existing user
    }>('/github/save-token', null, {
      params: { user_id: userId, token }
    }),
}
