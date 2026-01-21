/**
 * Electron environment detection utilities
 */

/**
 * Check if the app is running in Electron
 */
export function isElectron(): boolean {
  return !!(window as Window & { electron?: unknown }).electron
}

/**
 * Get the backend URL for API calls
 * In Electron: returns the local backend URL
 * In Web: returns empty string (uses proxy)
 */
export async function getBackendUrl(): Promise<string> {
  if (isElectron()) {
    const electron = (window as Window & { electron?: { getBackendUrl: () => Promise<string> } }).electron
    if (electron) {
      return electron.getBackendUrl()
    }
  }
  return '' // Web: use Vite proxy
}

/**
 * Get the current platform
 * In Electron: returns the actual platform (win32, darwin, linux)
 * In Web: returns 'web'
 */
export async function getPlatform(): Promise<string> {
  if (isElectron()) {
    const electron = (window as Window & { electron?: { getPlatform: () => Promise<string> } }).electron
    if (electron) {
      return electron.getPlatform()
    }
  }
  return 'web'
}

/**
 * Get the app version
 * In Electron: returns the app version
 * In Web: returns 'web'
 */
export async function getAppVersion(): Promise<string> {
  if (isElectron()) {
    const electron = (window as Window & { electron?: { getAppVersion: () => Promise<string> } }).electron
    if (electron) {
      return electron.getAppVersion()
    }
  }
  return 'web'
}
