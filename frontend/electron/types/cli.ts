/**
 * CLI Types - Shared type definitions for CLI management
 *
 * Auto-Claude style implementation for Autopolio
 */

// ============================================================================
// CLI Types
// ============================================================================

export type CLIType = 'claude_code' | 'gemini_cli'

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

export interface CLIValidation {
  valid: boolean
  version: string | null
  error?: string
}

export interface CLITestResult {
  success: boolean
  tool: CLIType
  message: string
  version?: string
  path?: string
  output?: string
  error?: CLIError
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CLICacheEntry {
  status: CLIStatus
  timestamp: number
}

export interface VersionCacheEntry {
  version: string
  timestamp: number
}

// ============================================================================
// Process Management Types
// ============================================================================

export type ProcessStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error'

export interface ManagedProcess {
  id: string
  tool: CLIType
  status: ProcessStatus
  cwd: string
  startedAt: Date
  pid?: number
  error?: CLIError
}

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

// ============================================================================
// Output Types
// ============================================================================

export type OutputType = 'stdout' | 'stderr' | 'system'

export interface OutputData {
  sessionId: string
  type: OutputType
  data: string
  timestamp: number
}

export interface OutputCallback {
  (data: OutputData): void
}

// ============================================================================
// Error Types
// ============================================================================

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
  retryAfter?: number  // for rate limit errors, in milliseconds
  details?: string
}

// ============================================================================
// Registry Types
// ============================================================================

export interface NpmPackageInfo {
  name: string
  version: string
  description?: string
}

export interface VersionFetchResult {
  success: boolean
  version?: string
  error?: string
}

// ============================================================================
// Configuration
// ============================================================================

export interface CLIConfig {
  tool: CLIType
  name: string
  executable: string  // 'claude' or 'gemini'
  npmPackage: string  // '@anthropic-ai/claude-code' or '@google/gemini-cli'
  docsUrl: string
  changelogUrl: string
}

export const CLI_CONFIGS: Record<CLIType, CLIConfig> = {
  claude_code: {
    tool: 'claude_code',
    name: 'Claude Code CLI',
    executable: 'claude',
    npmPackage: '@anthropic-ai/claude-code',
    docsUrl: 'https://claude.ai/code',
    changelogUrl: 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md',
  },
  gemini_cli: {
    tool: 'gemini_cli',
    name: 'Gemini CLI',
    executable: 'gemini',
    npmPackage: '@google/gemini-cli',
    docsUrl: 'https://ai.google.dev/gemini-cli',
    changelogUrl: 'https://github.com/google-gemini/gemini-cli/releases',
  },
}

// ============================================================================
// Platform Constants
// ============================================================================

export const isWindows = process.platform === 'win32'
export const isMacOS = process.platform === 'darwin'
export const isLinux = process.platform === 'linux'

// Cache durations
export const STATUS_CACHE_TTL = 5 * 60 * 1000      // 5 minutes for CLI status
export const VERSION_CACHE_TTL = 24 * 60 * 60 * 1000  // 24 hours for npm versions

// Timeouts
export const COMMAND_TIMEOUT = 30000    // 30 seconds for CLI commands
export const NETWORK_TIMEOUT = 10000    // 10 seconds for network requests

// Debug flag - set to true to enable verbose logging
// In production, this should be false or controlled via environment variable
export const CLI_DEBUG = process.env.CLI_DEBUG === 'true' || process.env.NODE_ENV === 'development' || true
