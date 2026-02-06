/**
 * Electron API Types
 * 
 * These types match the APIs exposed via preload.js
 */

export interface GitHubCLIStatus {
  installed: boolean
  version: string | null
  path: string | null
  authenticated: boolean
  username: string | null
  scopes: string[]
  install_command: string
}

export interface GitHubDeviceCodeEvent {
  device_code: string
  user_code: string
  verification_uri: string
}

export interface GitHubAuthResult {
  success: boolean
  pending?: boolean
  username?: string
  token?: string
  device_code?: string
  verification_uri?: string
  error?: string
}

export interface CLIStatus {
  tool: string
  installed: boolean
  version: string | null
  latest_version: string | null
  is_outdated: boolean
  path: string | null
  install_command: string
  update_command: string | null
  platform: string
}

export interface ElectronAPI {
  // Basic APIs
  isElectron: () => Promise<boolean>
  getBackendUrl: () => Promise<string>
  getPlatform: () => Promise<string>
  getAppVersion: () => Promise<string>
  getUserDataPath: () => Promise<string>

  // CLI Detection APIs
  getClaudeCLIStatus: () => Promise<CLIStatus>
  getGeminiCLIStatus: () => Promise<CLIStatus>
  refreshCLIStatus: () => Promise<Record<string, CLIStatus>>
  refreshSingleCLIStatus: (tool: 'claude_code' | 'gemini_cli') => Promise<CLIStatus>

  // CLI Test API
  testCLI: (tool: string, model?: string) => Promise<unknown>

  // CLI Process Management APIs
  startCLI: (config: unknown) => Promise<unknown>
  stopCLI: (sessionId: string) => Promise<unknown>
  getCLIProcessStatus: (sessionId: string) => Promise<unknown>
  getCLISessions: () => Promise<unknown[]>
  sendCLIInput: (sessionId: string, input: string) => Promise<unknown>

  // CLI Output Streaming APIs
  subscribeCLIOutput: (sessionId: string, callback: (data: unknown) => void) => () => void
  onCLIOutput: (callback: (data: unknown) => void) => () => void

  // GitHub CLI APIs (Device Code Flow)
  getGitHubCLIStatus: () => Promise<GitHubCLIStatus>
  startGitHubAuth: () => Promise<GitHubAuthResult>
  cancelGitHubAuth: () => Promise<{ success: boolean; message?: string }>
  logoutGitHub: () => Promise<{ success: boolean }>
  getGitHubToken: () => Promise<{ success: boolean; token?: string; error?: string }>
  onGitHubDeviceCode: (callback: (data: GitHubDeviceCodeEvent) => void) => () => void
  onGitHubAuthComplete: (callback: (data: GitHubAuthResult) => void) => () => void
}

declare global {
  interface Window {
    electron?: ElectronAPI
  }
}

export {}
