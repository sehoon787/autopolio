/**
 * API client for data migration (Desktop → Web transfer).
 */
import apiClient from './client'

export interface DataExport {
  version: string
  exported_at: string
  user: Record<string, unknown>
  companies: Record<string, unknown>[]
  projects: Record<string, unknown>[]
  achievements: Record<string, unknown>[]
  technologies: Record<string, unknown>[]
  certifications: Record<string, unknown>[]
  awards: Record<string, unknown>[]
  educations: Record<string, unknown>[]
  publications: Record<string, unknown>[]
  volunteer_activities: Record<string, unknown>[]
}

export interface DataImportResult {
  success: boolean
  imported_counts: Record<string, number>
  skipped_counts: Record<string, number>
  errors: string[]
}

/**
 * Export all user data as JSON.
 */
export async function exportUserData(): Promise<DataExport> {
  const { data } = await apiClient.get<DataExport>('/data/export')
  return data
}

/**
 * Import user data from a JSON export.
 */
export async function importUserData(payload: DataExport): Promise<DataImportResult> {
  const { data } = await apiClient.post<DataImportResult>('/data/import', payload)
  return data
}

/**
 * Download export as a JSON file.
 */
export async function downloadExport(): Promise<void> {
  const data = await exportUserData()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `autopolio-export-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
