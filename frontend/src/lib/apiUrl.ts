import { useAppStore } from '@/stores/appStore'

/**
 * Convert an API relative path to a full URL appropriate for the current environment.
 * - Web mode: returns the path as-is (Vite proxy handles /api/...)
 * - Electron mode: prepends the backend URL (e.g., http://localhost:8085)
 */
export function getFullApiUrl(relativePath: string): string {
  const { backendUrl, isElectronApp } = useAppStore.getState()

  if (isElectronApp && backendUrl) {
    return `${backendUrl}${relativePath}`
  }

  return relativePath
}
