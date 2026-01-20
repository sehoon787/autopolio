import apiClient from './client'

export interface User {
  id: number
  name: string
  email: string | null
  github_username: string | null
  github_avatar_url: string | null
  preferred_llm: string
  created_at: string
  updated_at: string
}

export interface UserStats {
  user_id: number
  companies_count: number
  projects_count: number
  analyzed_projects_count: number
  documents_count: number
  github_connected: boolean
}

export const usersApi = {
  getAll: () => apiClient.get<User[]>('/users'),

  getById: (id: number) => apiClient.get<User>(`/users/${id}`),

  create: (data: { name: string; email?: string }) =>
    apiClient.post<User>('/users', data),

  update: (id: number, data: Partial<User>) =>
    apiClient.put<User>(`/users/${id}`, data),

  delete: (id: number) => apiClient.delete(`/users/${id}`),

  getStats: (id: number) => apiClient.get<UserStats>(`/users/${id}/stats`),
}
