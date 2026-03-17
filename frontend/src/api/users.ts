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
  profile_photo_url: string | null  // Uploaded resume photo

  // OAuth default values
  oauth_defaults: OAuthDefaults

  // Effective values (user value if set, otherwise OAuth default)
  effective_name: string
  effective_email: string | null
  effective_avatar_url: string | null
  effective_photo_url: string | null  // profile_photo_url or github_avatar_url
}

// Generation options types
export interface GenerationOptions {
  // AI Analysis settings
  default_summary_style: string  // professional, casual, technical
  default_analysis_language: string  // ko, en
  default_analysis_scope: string  // quick, standard, detailed
  // Document generation settings (used in Generate page)
  default_output_format: string  // docx, pdf, md
  default_include_achievements: boolean
  default_include_tech_stack: boolean
}

export interface GenerationOptionsUpdate {
  // AI Analysis settings
  default_summary_style?: string
  default_analysis_language?: string
  default_analysis_scope?: string
  // Document generation settings
  default_output_format?: string
  default_include_achievements?: boolean
  default_include_tech_stack?: boolean
}

export const usersApi = {
  getAll: () => apiClient.get<User[]>('/users'),

  getById: (id: number) => apiClient.get<User>(`/users/${id}`),

  create: (data: { name: string; email?: string; github_username?: string }) =>
    apiClient.post<User>('/users', data),

  update: (id: number, data: Partial<User>) =>
    apiClient.put<User>(`/users/${id}`, data),

  delete: (id: number) => apiClient.delete(`/users/${id}`),

  getStats: (id: number) => apiClient.get<UserStats>(`/users/${id}/stats`),

  // Profile API
  getProfile: (id: number) => apiClient.get<UserProfile>(`/users/${id}/profile`),

  updateProfile: (id: number, data: UserProfileUpdate) =>
    apiClient.put<UserProfile>(`/users/${id}/profile`, data),

  // Generation options API
  getGenerationOptions: (id: number) =>
    apiClient.get<GenerationOptions>(`/users/${id}/generation-options`),

  updateGenerationOptions: (id: number, data: GenerationOptionsUpdate) =>
    apiClient.put<GenerationOptions>(`/users/${id}/generation-options`, data),

  // Photo API
  uploadPhoto: (id: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    // Don't set Content-Type header manually - axios will set it with correct boundary
    return apiClient.post<{ success: boolean; photo_url: string; filename: string }>(
      `/users/${id}/photo`,
      formData
    )
  },

  deletePhoto: (id: number) =>
    apiClient.delete<{ success: boolean; message: string }>(`/users/${id}/photo`),
}
