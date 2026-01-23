/**
 * Electron environment detection utilities
 */

// Type definitions for Electron API
interface CLIStatus {
  tool: string
  installed: boolean
  version: string | null
  latest_version: string | null
  is_outdated: boolean
  path: string | null
  install_command: string
  platform: string
}

interface ElectronAPI {
  isElectron: () => Promise<boolean>
  getBackendUrl: () => Promise<string>
  getPlatform: () => Promise<string>
  getAppVersion: () => Promise<string>
  getUserDataPath: () => Promise<string>
  getClaudeCLIStatus: () => Promise<CLIStatus>
  getGeminiCLIStatus: () => Promise<CLIStatus>
  refreshCLIStatus: () => Promise<{ claude: CLIStatus; gemini: CLIStatus }>
}

declare global {
  interface Window {
    electron?: ElectronAPI
  }
}

/**
 * Check if the app is running in Electron
 */
export function isElectron(): boolean {
  const hasElectron = !!(window as Window & { electron?: unknown }).electron
  console.log('[Electron] isElectron check:', hasElectron)
  return hasElectron
}

/**
 * Get the backend URL for API calls
 * In Electron: returns the local backend URL
 * In Web: returns empty string (uses proxy)
 */
export async function getBackendUrl(): Promise<string> {
  if (isElectron() && window.electron) {
    return window.electron.getBackendUrl()
  }
  return '' // Web: use Vite proxy
}

/**
 * Get the current platform
 * In Electron: returns the actual platform (win32, darwin, linux)
 * In Web: returns 'web'
 */
export async function getPlatform(): Promise<string> {
  if (isElectron() && window.electron) {
    return window.electron.getPlatform()
  }
  return 'web'
}

/**
 * Get the app version
 * In Electron: returns the app version
 * In Web: returns 'web'
 */
export async function getAppVersion(): Promise<string> {
  if (isElectron() && window.electron) {
    return window.electron.getAppVersion()
  }
  return 'web'
}

/**
 * Get Claude CLI status
 * In Electron: detects CLI directly via IPC (Auto-Claude style)
 * In Web: returns null
 */
export async function getClaudeCLIStatus(): Promise<CLIStatus | null> {
  if (isElectron() && window.electron) {
    try {
      return await window.electron.getClaudeCLIStatus()
    } catch (error) {
      console.error('[Electron] Failed to get Claude CLI status:', error)
    }
  }
  return null
}

/**
 * Get Gemini CLI status
 * In Electron: detects CLI directly via IPC
 * In Web: returns null
 */
export async function getGeminiCLIStatus(): Promise<CLIStatus | null> {
  if (isElectron() && window.electron) {
    try {
      return await window.electron.getGeminiCLIStatus()
    } catch (error) {
      console.error('[Electron] Failed to get Gemini CLI status:', error)
    }
  }
  return null
}

/**
 * Refresh CLI status (force re-detection)
 * In Electron: refreshes via IPC
 * In Web: returns null
 */
export async function refreshCLIStatus(): Promise<{ claude: CLIStatus | null; gemini: CLIStatus | null } | null> {
  if (isElectron() && window.electron) {
    try {
      return await window.electron.refreshCLIStatus()
    } catch (error) {
      console.error('[Electron] Failed to refresh CLI status:', error)
    }
  }
  return null
}

export type { CLIStatus }
