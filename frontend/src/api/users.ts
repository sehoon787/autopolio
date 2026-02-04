import apiClient from './client'

export interface User {
  id: number
  name: string
  email: string | null
  github_username: string | null
  github_avatar_url: string | null
  preferred_llm: string
  preferred_language: string  // "ko" or "en" (v1.12)
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

// Profile types for personal info management
export interface OAuthDefaults {
  name: string | null
  email: string | null
  avatar_url: string | null
}

export interface UserProfileUpdate {
  display_name?: string | null
  profile_email?: string | null
  phone?: string | null
  address?: string | null
  birthdate?: string | null  // ISO date string YYYY-MM-DD
}

export interface UserProfile {
  // User-entered values (can be null or "")
  display_name: string | null
  profile_email: string | null
  phone: string | null
  address: string | null
  birthdate: string | null

  // OAuth default values
  oauth_defaults: OAuthDefaults

  // Effective values (user value if set, otherwise OAuth default)
  effective_name: string
  effective_email: string | null
  effective_avatar_url: string | null
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

  // Profile API
  getProfile: (id: number) => apiClient.get<UserProfile>(`/users/${id}/profile`),

  updateProfile: (id: number, data: UserProfileUpdate) =>
    apiClient.put<UserProfile>(`/users/${id}/profile`, data),
}
