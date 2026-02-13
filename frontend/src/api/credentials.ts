import apiClient from './client'
import { getFullApiUrl } from '@/lib/apiUrl'

// ============================================================
// Certification Types (자격증)
// ============================================================

export interface Certification {
  id: number
  user_id: number
  name: string
  issuer: string | null
  issue_date: string | null
  expiry_date: string | null
  credential_id: string | null
  credential_url: string | null
  description: string | null
  attachment_path: string | null
  attachment_name: string | null
  attachment_size: number | null
  display_order: number
  created_at: string
  updated_at: string
}

export interface CertificationCreate {
  name: string
  issuer?: string
  issue_date?: string
  expiry_date?: string
  credential_id?: string
  credential_url?: string
  description?: string
  display_order?: number
}

// ============================================================
// Award Types (수상이력)
// ============================================================

export interface Award {
  id: number
  user_id: number
  name: string
  issuer: string | null
  award_date: string | null
  description: string | null
  award_url: string | null
  attachment_path: string | null
  attachment_name: string | null
  attachment_size: number | null
  display_order: number
  created_at: string
  updated_at: string
}

export interface AwardCreate {
  name: string
  issuer?: string
  award_date?: string
  description?: string
  award_url?: string
  display_order?: number
}

// ============================================================
// Education Types (교육이력)
// ============================================================

export interface Education {
  id: number
  user_id: number
  school_name: string
  major: string | null
  degree: string | null
  start_date: string | null
  end_date: string | null
  is_current: boolean
  graduation_status: string | null  // graduated/enrolled/completed/withdrawn
  gpa: string | null
  description: string | null
  // University metadata (from Hipo database)
  school_country: string | null
  school_country_code: string | null
  school_state: string | null
  school_domain: string | null
  school_web_page: string | null
  attachment_path: string | null
  attachment_name: string | null
  attachment_size: number | null
  display_order: number
  created_at: string
  updated_at: string
}

export interface EducationCreate {
  school_name: string
  major?: string
  degree?: string
  start_date?: string
  end_date?: string
  is_current?: boolean
  graduation_status?: string  // graduated/enrolled/completed/withdrawn
  gpa?: string
  description?: string
  // University metadata
  school_country?: string
  school_country_code?: string
  school_state?: string
  school_domain?: string
  school_web_page?: string
  display_order?: number
}

// ============================================================
// Publication Types (논문/저술)
// ============================================================

export interface Publication {
  id: number
  user_id: number
  title: string
  authors: string | null
  publication_type: string | null
  publisher: string | null
  publication_date: string | null
  doi: string | null
  url: string | null
  description: string | null
  attachment_path: string | null
  attachment_name: string | null
  attachment_size: number | null
  display_order: number
  created_at: string
  updated_at: string
}

export interface PublicationCreate {
  title: string
  authors?: string
  publication_type?: string
  publisher?: string
  publication_date?: string
  doi?: string
  url?: string
  description?: string
  display_order?: number
}

// ============================================================
// API Functions
// ============================================================

export const certificationsApi = {
  getAll: (userId: number) =>
    apiClient.get<Certification[]>('/knowledge/credentials/certifications', {
      params: { user_id: userId }
    }),

  getById: (userId: number, id: number) =>
    apiClient.get<Certification>(`/knowledge/credentials/certifications/${id}`, {
      params: { user_id: userId }
    }),

  create: (userId: number, data: CertificationCreate) =>
    apiClient.post<Certification>('/knowledge/credentials/certifications', data, {
      params: { user_id: userId }
    }),

  update: (userId: number, id: number, data: Partial<CertificationCreate>) =>
    apiClient.put<Certification>(`/knowledge/credentials/certifications/${id}`, data, {
      params: { user_id: userId }
    }),

  delete: (userId: number, id: number) =>
    apiClient.delete(`/knowledge/credentials/certifications/${id}`, {
      params: { user_id: userId }
    }),

  reorder: (userId: number, itemIds: number[]) =>
    apiClient.put<Certification[]>('/knowledge/credentials/certifications/reorder', { item_ids: itemIds }, {
      params: { user_id: userId }
    }),
}

export const awardsApi = {
  getAll: (userId: number) =>
    apiClient.get<Award[]>('/knowledge/credentials/awards', {
      params: { user_id: userId }
    }),

  getById: (userId: number, id: number) =>
    apiClient.get<Award>(`/knowledge/credentials/awards/${id}`, {
      params: { user_id: userId }
    }),

  create: (userId: number, data: AwardCreate) =>
    apiClient.post<Award>('/knowledge/credentials/awards', data, {
      params: { user_id: userId }
    }),

  update: (userId: number, id: number, data: Partial<AwardCreate>) =>
    apiClient.put<Award>(`/knowledge/credentials/awards/${id}`, data, {
      params: { user_id: userId }
    }),

  delete: (userId: number, id: number) =>
    apiClient.delete(`/knowledge/credentials/awards/${id}`, {
      params: { user_id: userId }
    }),

  reorder: (userId: number, itemIds: number[]) =>
    apiClient.put<Award[]>('/knowledge/credentials/awards/reorder', { item_ids: itemIds }, {
      params: { user_id: userId }
    }),
}

export const educationsApi = {
  getAll: (userId: number) =>
    apiClient.get<Education[]>('/knowledge/credentials/educations', {
      params: { user_id: userId }
    }),

  getById: (userId: number, id: number) =>
    apiClient.get<Education>(`/knowledge/credentials/educations/${id}`, {
      params: { user_id: userId }
    }),

  create: (userId: number, data: EducationCreate) =>
    apiClient.post<Education>('/knowledge/credentials/educations', data, {
      params: { user_id: userId }
    }),

  update: (userId: number, id: number, data: Partial<EducationCreate>) =>
    apiClient.put<Education>(`/knowledge/credentials/educations/${id}`, data, {
      params: { user_id: userId }
    }),

  delete: (userId: number, id: number) =>
    apiClient.delete(`/knowledge/credentials/educations/${id}`, {
      params: { user_id: userId }
    }),

  reorder: (userId: number, itemIds: number[]) =>
    apiClient.put<Education[]>('/knowledge/credentials/educations/reorder', { item_ids: itemIds }, {
      params: { user_id: userId }
    }),
}

export const publicationsApi = {
  getAll: (userId: number) =>
    apiClient.get<Publication[]>('/knowledge/credentials/publications', {
      params: { user_id: userId }
    }),

  getById: (userId: number, id: number) =>
    apiClient.get<Publication>(`/knowledge/credentials/publications/${id}`, {
      params: { user_id: userId }
    }),

  create: (userId: number, data: PublicationCreate) =>
    apiClient.post<Publication>('/knowledge/credentials/publications', data, {
      params: { user_id: userId }
    }),

  update: (userId: number, id: number, data: Partial<PublicationCreate>) =>
    apiClient.put<Publication>(`/knowledge/credentials/publications/${id}`, data, {
      params: { user_id: userId }
    }),

  delete: (userId: number, id: number) =>
    apiClient.delete(`/knowledge/credentials/publications/${id}`, {
      params: { user_id: userId }
    }),

  reorder: (userId: number, itemIds: number[]) =>
    apiClient.put<Publication[]>('/knowledge/credentials/publications/reorder', { item_ids: itemIds }, {
      params: { user_id: userId }
    }),
}

// ============================================================
// VolunteerActivity Types (봉사활동/대외활동)
// ============================================================

export interface VolunteerActivity {
  id: number
  user_id: number
  name: string
  organization: string | null
  activity_type: string | null
  start_date: string | null
  end_date: string | null
  is_current: boolean
  hours: number | null
  role: string | null
  description: string | null
  certificate_url: string | null
  attachment_path: string | null
  attachment_name: string | null
  attachment_size: number | null
  display_order: number
  created_at: string
  updated_at: string
}

export interface VolunteerActivityCreate {
  name: string
  organization?: string
  activity_type?: string
  start_date?: string
  end_date?: string
  is_current?: boolean
  hours?: number
  role?: string
  description?: string
  certificate_url?: string
  display_order?: number
}

export const volunteerActivitiesApi = {
  getAll: (userId: number) =>
    apiClient.get<VolunteerActivity[]>('/knowledge/credentials/volunteer_activities', {
      params: { user_id: userId }
    }),

  getById: (userId: number, id: number) =>
    apiClient.get<VolunteerActivity>(`/knowledge/credentials/volunteer_activities/${id}`, {
      params: { user_id: userId }
    }),

  create: (userId: number, data: VolunteerActivityCreate) =>
    apiClient.post<VolunteerActivity>('/knowledge/credentials/volunteer_activities', data, {
      params: { user_id: userId }
    }),

  update: (userId: number, id: number, data: Partial<VolunteerActivityCreate>) =>
    apiClient.put<VolunteerActivity>(`/knowledge/credentials/volunteer_activities/${id}`, data, {
      params: { user_id: userId }
    }),

  delete: (userId: number, id: number) =>
    apiClient.delete(`/knowledge/credentials/volunteer_activities/${id}`, {
      params: { user_id: userId }
    }),

  reorder: (userId: number, itemIds: number[]) =>
    apiClient.put<VolunteerActivity[]>('/knowledge/credentials/volunteer_activities/reorder', { item_ids: itemIds }, {
      params: { user_id: userId }
    }),
}

// Attachment types
export type CredentialType = 'certifications' | 'awards' | 'educations' | 'publications' | 'volunteer_activities'

export interface AttachmentUploadResponse {
  message: string
  attachment_path: string
  attachment_name: string
  attachment_size: number
}

// Attachment API functions
export const attachmentsApi = {
  upload: (userId: number, credentialType: CredentialType, id: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.post<AttachmentUploadResponse>(
      `/knowledge/credentials/${credentialType}/${id}/attachment`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        params: { user_id: userId },
      }
    )
  },

  getDownloadUrl: (userId: number, credentialType: CredentialType, id: number) =>
    getFullApiUrl(`/api/knowledge/credentials/${credentialType}/${id}/attachment?user_id=${userId}`),

  delete: (userId: number, credentialType: CredentialType, id: number) =>
    apiClient.delete(`/knowledge/credentials/${credentialType}/${id}/attachment`, {
      params: { user_id: userId }
    }),
}

// Combined credentials API
export const credentialsApi = {
  certifications: certificationsApi,
  awards: awardsApi,
  educations: educationsApi,
  publications: publicationsApi,
  volunteerActivities: volunteerActivitiesApi,
  attachments: attachmentsApi,
}

export default credentialsApi
