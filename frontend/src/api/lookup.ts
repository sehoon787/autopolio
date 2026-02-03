import apiClient from './client'

// Types
export interface CertificationResult {
  id: string
  name: string
  name_original: string
  issuer: string
  category: string
  validity_years: number | null
  score: number
}

export interface UniversityResult {
  name: string
  country: string         // Full country name (e.g., "South Korea")
  country_code: string    // ISO alpha-2 code (e.g., "KR")
  state: string           // State/province (nullable)
  domain: string          // Primary email domain
  domains: string[]       // All email domains
  web_page: string        // Primary website URL
  web_pages: string[]     // All website URLs
  score: number
}

export interface MajorResult {
  name: string
  name_en: string
  score: number
}

export interface CategoryOption {
  value: string
  label: string
}

export interface CountryOption {
  value: string
  label: string
}

// API Functions
export const lookupApi = {
  searchCertifications: async (
    query: string,
    lang: string = 'ko',
    category?: string,
    limit: number = 20
  ) => {
    const params: Record<string, string | number> = { q: query, lang, limit }
    if (category) params.category = category
    return apiClient.get<{ results: CertificationResult[]; total: number }>(
      '/lookup/certifications',
      { params }
    )
  },

  getCertificationCategories: async () => {
    return apiClient.get<{ categories: CategoryOption[] }>(
      '/lookup/certifications/categories'
    )
  },

  searchUniversities: async (
    query: string,
    country?: string,
    limit: number = 20
  ) => {
    const params: Record<string, string | number> = { q: query, limit }
    if (country) params.country = country
    return apiClient.get<{ results: UniversityResult[]; total: number }>(
      '/lookup/universities',
      { params }
    )
  },

  getUniversityCountries: async () => {
    return apiClient.get<{ countries: CountryOption[] }>(
      '/lookup/universities/countries'
    )
  },

  searchMajors: async (query: string, limit: number = 20) => {
    return apiClient.get<{ results: MajorResult[]; total: number }>(
      '/lookup/majors',
      { params: { q: query, limit } }
    )
  },
}

export default lookupApi
