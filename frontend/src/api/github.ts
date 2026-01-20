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

export const githubApi = {
  connect: (redirectUrl?: string) =>
    apiClient.get<{ auth_url: string }>('/github/connect', {
      params: redirectUrl ? { redirect_url: redirectUrl } : {}
    }),

  disconnect: (userId: number) =>
    apiClient.delete('/github/disconnect', { params: { user_id: userId } }),

  getRepos: (userId: number, page: number = 1, perPage: number = 30) =>
    apiClient.get<{ repos: GitHubRepo[]; total: number }>('/github/repos', {
      params: { user_id: userId, page, per_page: perPage }
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
}
