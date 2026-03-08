/**
 * Electron environment detection utilities
 */

import type { CLIType } from '@/constants'

// ============================================================================
// CLI Types (re-exported from constants for backward compatibility)
// ============================================================================

export type { CLIType }

export interface CLIStatus {
  tool: CLIType
  installed: boolean
  version: string | null
  latest_version: string | null
  is_outdated: boolean
  path: string | null
  install_command: string
  update_command: string | null
  platform: string
}

export interface CLITestResult {
  success: boolean
  tool: CLIType
  message: string
  version?: string
  path?: string
  output?: string
  tokens?: number
  auth_status?: 'authenticated' | 'auth_failed' | 'unknown'
  error?: CLIError
}

export type CLIErrorType =
  | 'not_found'
  | 'not_installed'
  | 'execution_failed'
  | 'rate_limit'
  | 'auth_failure'
  | 'network_error'
  | 'timeout'
  | 'unknown'

export interface CLIError {
  type: CLIErrorType
  message: string
  retryAfter?: number
  details?: string
}

export type ProcessStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error'

export interface CLIStartConfig {
  tool: CLIType
  cwd: string
  args?: string[]
  env?: Record<string, string>
  prompt?: string
}

export interface ProcessInfo {
  sessionId: string
  tool: CLIType
  status: ProcessStatus
  pid?: number
  startedAt?: string
  error?: CLIError
}

export type OutputType = 'stdout' | 'stderr' | 'system'

export interface OutputData {
  sessionId: string
  type: OutputType
  data: string
  timestamp: number
}

export type OutputCallback = (data: OutputData) => void

// ============================================================================
// CLI Auth Types (Native Login)
// ============================================================================

export interface CLIAuthStatus {
  authenticated: boolean
  method?: 'oauth' | 'api_key'
  email?: string        // Claude Code
  account?: string      // Gemini CLI
  error?: string
}

// ============================================================================
// Electron API Type Definition
// ============================================================================

interface ElectronAPI {
  // Basic APIs
  isElectron: () => Promise<boolean>
  getBackendUrl: () => Promise<string>
  getPlatform: () => Promise<string>
  getAppVersion: () => Promise<string>
  getUserDataPath: () => Promise<string>

  // CLI Process Management APIs
  startCLI: (config: CLIStartConfig) => Promise<string>
  stopCLI: (sessionId: string) => Promise<void>
  getCLIProcessStatus: (sessionId: string) => Promise<ProcessInfo | null>
  getCLISessions: () => Promise<ProcessInfo[]>
  sendCLIInput: (sessionId: string, input: string) => Promise<boolean>

  // CLI Output Streaming APIs (NEW)
  subscribeCLIOutput: (sessionId: string, callback: OutputCallback) => () => void
  onCLIOutput: (callback: OutputCallback) => () => void

  // GitHub CLI APIs (Device Code Flow)
  getGitHubCLIStatus: () => Promise<{
    installed: boolean
    version: string | null
    path: string | null
    authenticated: boolean
    username: string | null
    scopes: string[]
    install_command: string
  }>
  startGitHubAuth: () => Promise<{
    success: boolean
    pending?: boolean
    username?: string
    token?: string
    device_code?: string
    verification_uri?: string
    error?: string
  }>
  cancelGitHubAuth: () => Promise<{ success: boolean; message?: string }>
  logoutGitHub: () => Promise<{ success: boolean }>
  getGitHubToken: () => Promise<{ success: boolean; token?: string; error?: string }>
  onGitHubDeviceCode: (callback: (data: {
    device_code: string
    user_code: string
    verification_uri: string
  }) => void) => () => void
  onGitHubAuthComplete: (callback: (data: {
    success: boolean
    pending?: boolean
    username?: string
    token?: string
    device_code?: string
    verification_uri?: string
    error?: string
  }) => void) => () => void

  // GitHub Repository listing via CLI (multi-endpoint aggregation matching backend)
  listGitHubRepos: () => Promise<{
    success: boolean
    repos?: Array<{
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
      fork: boolean
      owner: string
    }>
    total?: number
    error?: string
  }>
}

declare global {
  interface Window {
    electron?: ElectronAPI
  }
}

// ============================================================================
// Basic Utilities
// ============================================================================

/**
 * Check if the app is running in Electron
 */
export function isElectron(): boolean {
  const hasElectron = !!(window as Window & { electron?: unknown }).electron
  console.log('[isElectron] window.electron exists:', hasElectron)
  if (hasElectron && window.electron) {
    console.log('[isElectron] window.electron keys:', Object.keys(window.electron))
  }
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

// ============================================================================
// CLI Process Management APIs
// ============================================================================

/**
 * Start a CLI process
 * In Electron: starts via IPC, returns session ID
 * In Web: returns null
 */
export async function startCLI(config: CLIStartConfig): Promise<string | null> {
  if (isElectron() && window.electron) {
    try {
      return await window.electron.startCLI(config)
    } catch (error) {
      console.error('[Electron] Failed to start CLI:', error)
      throw error
    }
  }
  return null
}

/**
 * Stop a CLI process
 * In Electron: stops via IPC
 * In Web: no-op
 */
export async function stopCLI(sessionId: string): Promise<void> {
  if (isElectron() && window.electron) {
    try {
      await window.electron.stopCLI(sessionId)
    } catch (error) {
      console.error('[Electron] Failed to stop CLI:', error)
      throw error
    }
  }
}

/**
 * Get CLI process status
 * In Electron: gets status via IPC
 * In Web: returns null
 */
export async function getCLIProcessStatus(sessionId: string): Promise<ProcessInfo | null> {
  if (isElectron() && window.electron) {
    try {
      return await window.electron.getCLIProcessStatus(sessionId)
    } catch (error) {
      console.error('[Electron] Failed to get CLI process status:', error)
    }
  }
  return null
}

/**
 * Get all active CLI sessions
 * In Electron: gets sessions via IPC
 * In Web: returns empty array
 */
export async function getCLISessions(): Promise<ProcessInfo[]> {
  if (isElectron() && window.electron) {
    try {
      return await window.electron.getCLISessions()
    } catch (error) {
      console.error('[Electron] Failed to get CLI sessions:', error)
    }
  }
  return []
}

/**
 * Send input to a CLI process
 * In Electron: sends via IPC
 * In Web: returns false
 */
export async function sendCLIInput(sessionId: string, input: string): Promise<boolean> {
  if (isElectron() && window.electron) {
    try {
      return await window.electron.sendCLIInput(sessionId, input)
    } catch (error) {
      console.error('[Electron] Failed to send CLI input:', error)
    }
  }
  return false
}

// ============================================================================
// CLI Output Streaming APIs (NEW)
// ============================================================================

/**
 * Subscribe to CLI output for a session
 * In Electron: subscribes via IPC, returns unsubscribe function
 * In Web: returns no-op function
 */
export function subscribeCLIOutput(sessionId: string, callback: OutputCallback): () => void {
  if (isElectron() && window.electron) {
    try {
      return window.electron.subscribeCLIOutput(sessionId, callback)
    } catch (error) {
      console.error('[Electron] Failed to subscribe to CLI output:', error)
    }
  }
  return () => {} // No-op unsubscribe
}

/**
 * Subscribe to all CLI output (not filtered by session)
 * In Electron: subscribes via IPC, returns unsubscribe function
 * In Web: returns no-op function
 */
export function onCLIOutput(callback: OutputCallback): () => void {
  if (isElectron() && window.electron) {
    try {
      return window.electron.onCLIOutput(callback)
    } catch (error) {
      console.error('[Electron] Failed to subscribe to CLI output:', error)
    }
  }
  return () => {} // No-op unsubscribe
}


