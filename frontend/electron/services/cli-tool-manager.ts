/**
 * CLI Tool Manager - Centralized CLI detection and management
 *
 * Auto-Claude style implementation for Autopolio
 * Handles CLI detection, version checking, and testing
 *
 * Key improvements over basic implementation:
 * - PATH augmentation for GUI-launched Electron apps
 * - NVM support for Node version managers
 * - Homebrew priority on macOS
 * - Improved Windows .cmd handling
 * - Detailed debug logging
 */

import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import os from 'os'
import type {
  CLIType,
  CLIStatus,
  CLIValidation,
  CLITestResult,
  CLICacheEntry,
  VersionCacheEntry,
  CLIError,
  CLI_CONFIGS,
} from '../types/cli.js'
import {
  isWindows,
  isMacOS,
  STATUS_CACHE_TTL,
  VERSION_CACHE_TTL,
  COMMAND_TIMEOUT,
  NETWORK_TIMEOUT,
  CLI_DEBUG,
} from '../types/cli.js'
import { getAugmentedEnv, getNvmBinPaths } from '../utils/env-utils.js'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

// Re-export CLI_CONFIGS for convenience
export { CLI_CONFIGS } from '../types/cli.js'

// Debug logger
function debugLog(message: string, ...args: unknown[]): void {
  if (CLI_DEBUG) {
    console.log(`[CLIToolManager] ${message}`, ...args)
  }
}

/**
 * CLIToolManager - Singleton class for CLI detection and management
 */
export class CLIToolManager {
  private static instance: CLIToolManager

  // Session-based caching for CLI status
  private statusCache: Map<CLIType, CLICacheEntry> = new Map()

  // Longer-lived cache for npm registry versions
  private versionCache: Map<CLIType, VersionCacheEntry> = new Map()

  private constructor() {}

  static getInstance(): CLIToolManager {
    if (!CLIToolManager.instance) {
      CLIToolManager.instance = new CLIToolManager()
    }
    return CLIToolManager.instance
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Detect CLI status (with caching)
   */
  async detectCLI(tool: CLIType): Promise<CLIStatus> {
    // Check cache first
    const cached = this.statusCache.get(tool)
    if (cached && Date.now() - cached.timestamp < STATUS_CACHE_TTL) {
      debugLog(`Using cached status for ${tool}`)
      return cached.status
    }

    // Perform fresh detection
    const status = await this.performDetection(tool)

    // Update cache
    this.statusCache.set(tool, { status, timestamp: Date.now() })

    return status
  }

  /**
   * Force refresh CLI status (bypasses cache)
   */
  async refreshCLI(tool: CLIType): Promise<CLIStatus> {
    // Clear cache for this tool
    this.statusCache.delete(tool)

    return this.detectCLI(tool)
  }

  /**
   * Refresh all CLI statuses
   */
  async refreshAll(): Promise<Record<CLIType, CLIStatus>> {
    const claude = await this.refreshCLI('claude_code')
    const gemini = await this.refreshCLI('gemini_cli')

    return {
      claude_code: claude,
      gemini_cli: gemini,
    }
  }

  /**
   * Test CLI by running a simple command
   */
  async testCLI(tool: CLIType): Promise<CLITestResult> {
    debugLog(`Testing ${tool}...`)

    // First, ensure we have the current status
    const status = await this.detectCLI(tool)

    if (!status.installed || !status.path) {
      return {
        success: false,
        tool,
        message: `${this.getConfig(tool).name} is not installed`,
        error: {
          type: 'not_installed',
          message: 'CLI is not installed. Please install it first.',
        },
      }
    }

    try {
      // Run --version to verify the CLI works
      const result = await this.executeCLI(status.path, ['--version'])

      return {
        success: true,
        tool,
        message: `${this.getConfig(tool).name} is working correctly`,
        version: status.version || undefined,
        path: status.path,
        output: result.stdout.trim(),
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      debugLog(`Test failed for ${tool}:`, errorMessage)

      return {
        success: false,
        tool,
        message: `Failed to run ${this.getConfig(tool).name}`,
        path: status.path,
        error: this.classifyError(errorMessage),
      }
    }
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.statusCache.clear()
    this.versionCache.clear()
    debugLog('All caches cleared')
  }

  // ============================================================================
  // Detection Logic
  // ============================================================================

  private async performDetection(tool: CLIType): Promise<CLIStatus> {
    const config = this.getConfig(tool)
    debugLog(`Detecting ${config.name}...`)

    const status: CLIStatus = {
      tool,
      installed: false,
      version: null,
      latest_version: null,
      is_outdated: false,
      path: null,
      install_command: this.getInstallCommand(tool),
      update_command: this.getUpdateCommand(tool),
      platform: process.platform,
    }

    let foundPath: string | null = null

    // Helper to safely run detection step with timeout
    const safeDetect = async (
      name: string,
      fn: () => Promise<string | null>
    ): Promise<string | null> => {
      try {
        debugLog(`Checking ${name}...`)
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => {
            debugLog(`${name} timed out`)
            resolve(null)
          }, 5000) // 5 second timeout per step
        )
        const result = await Promise.race([fn(), timeoutPromise])
        if (result) {
          debugLog(`Found in ${name}: ${result}`)
        }
        return result
      } catch (error) {
        debugLog(`Error in ${name}:`, error)
        return null
      }
    }

    // Detection order (by priority):

    // 1. Homebrew first on macOS (most common installation method)
    if (isMacOS && !foundPath) {
      foundPath = await safeDetect('Homebrew', () => this.findInHomebrew(config.executable))
    }

    // 2. System PATH with augmented environment
    if (!foundPath) {
      foundPath = await safeDetect('system PATH', () => this.findInSystemPath(config.executable))
    }

    // 3. npm global directory
    if (!foundPath) {
      foundPath = await safeDetect('npm global', () => this.findInNpmGlobal(config.executable))
    }

    // 4. NVM paths (Unix only, sorted by version - newest first)
    if (!foundPath && !isWindows) {
      foundPath = await safeDetect('NVM', () => this.findInNvm(config.executable))
    }

    // 5. Known installation paths (fallback)
    if (!foundPath) {
      foundPath = await safeDetect('known paths', () => this.findInKnownPaths(tool))
    }

    // 6. PowerShell Get-Command fallback (Windows only)
    if (!foundPath && isWindows) {
      foundPath = await safeDetect('PowerShell', () => this.findViaPowerShell(config.executable))
    }

    // Validate found path and get version
    if (foundPath) {
      debugLog(`Found ${config.name} at: ${foundPath}`)
      try {
        const validation = await Promise.race([
          this.validateCLI(foundPath),
          new Promise<CLIValidation>((resolve) =>
            setTimeout(() => resolve({ valid: false, version: null, error: 'Validation timed out' }), 10000)
          ),
        ])

        if (validation.valid) {
          status.installed = true
          status.path = foundPath
          status.version = validation.version
          debugLog(`Validated: ${config.name} v${validation.version}`)
        } else {
          debugLog(`Validation failed: ${validation.error}`)
        }
      } catch (error) {
        debugLog(`Validation error: ${error}`)
      }
    } else {
      debugLog(`${config.name} not found in any location`)
    }

    // Fetch latest version from npm registry (non-blocking)
    try {
      const versionPromise = this.fetchLatestVersion(tool)
      const timeoutPromise = new Promise<string>((resolve) =>
        setTimeout(() => resolve('unknown'), 5000)
      )
      status.latest_version = await Promise.race([versionPromise, timeoutPromise])
      if (status.version && status.latest_version && status.latest_version !== 'unknown') {
        status.is_outdated = this.compareVersions(status.version, status.latest_version)
      }
    } catch (error) {
      debugLog(`Failed to fetch latest version for ${tool}:`, error)
      status.latest_version = 'unknown'
    }

    debugLog(`Detection complete for ${config.name}:`, {
      installed: status.installed,
      version: status.version,
      path: status.path,
    })

    return status
  }

  // ============================================================================
  // Path Finding
  // ============================================================================

  /**
   * Find in Homebrew paths (macOS only)
   */
  private async findInHomebrew(executable: string): Promise<string | null> {
    if (!isMacOS) return null

    const homebrewPaths = [
      `/opt/homebrew/bin/${executable}`,  // Apple Silicon
      `/usr/local/bin/${executable}`,     // Intel
    ]

    for (const brewPath of homebrewPaths) {
      if (fs.existsSync(brewPath)) {
        debugLog(`Found in Homebrew: ${brewPath}`)
        return brewPath
      }
    }

    return null
  }

  /**
   * Find executable in system PATH using where/which with augmented environment
   */
  private async findInSystemPath(executable: string): Promise<string | null> {
    const augmentedEnv = getAugmentedEnv()

    debugLog(`Searching for ${executable} in system PATH...`)
    debugLog(`Current PATH (first 500 chars): ${(augmentedEnv.PATH || '').substring(0, 500)}...`)

    try {
      if (isWindows) {
        // Try 'where' command with augmented PATH
        // shell: true is required on Windows to properly resolve where.exe
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { stdout } = await execAsync(`where ${executable}`, {
          timeout: COMMAND_TIMEOUT,
          env: augmentedEnv,
          encoding: 'utf8',
          shell: true, // Required for Windows to properly resolve commands
        } as any) as unknown as { stdout: string; stderr: string }

        // Parse results - prefer .cmd or .exe over other matches
        const paths = stdout.trim().split('\n').map((p: string) => p.trim()).filter(Boolean)

        if (paths.length === 0) {
          return null
        }

        // Prefer .cmd (npm scripts) or .exe (native executables)
        const preferred = paths.find((p: string) =>
          p.toLowerCase().endsWith('.cmd') || p.toLowerCase().endsWith('.exe')
        ) || paths[0]

        if (preferred && fs.existsSync(preferred)) {
          debugLog(`Found via 'where': ${preferred}`)
          return preferred
        }
      } else {
        // Unix: use 'which' with augmented PATH
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { stdout } = await execAsync(`which ${executable}`, {
          timeout: COMMAND_TIMEOUT,
          env: augmentedEnv,
          encoding: 'utf8',
          shell: true, // Use shell to ensure proper PATH resolution
        } as any) as unknown as { stdout: string; stderr: string }

        const foundPath = stdout.trim()
        if (foundPath && fs.existsSync(foundPath)) {
          debugLog(`Found via 'which': ${foundPath}`)
          return foundPath
        }
      }
    } catch (error) {
      // Log the actual error for debugging
      const errMsg = error instanceof Error ? error.message : String(error)
      debugLog(`Not found in PATH via where/which: ${errMsg}`)
    }

    return null
  }

  /**
   * Find executable in npm global directory
   */
  private async findInNpmGlobal(executable: string): Promise<string | null> {
    const augmentedEnv = getAugmentedEnv()

    // 1. Try npm root -g to get npm global modules path
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { stdout } = await execAsync('npm root -g', {
        timeout: COMMAND_TIMEOUT,
        env: augmentedEnv,
        encoding: 'utf8',
        shell: true, // Required for proper npm resolution
      } as any) as unknown as { stdout: string; stderr: string }

      const npmModules = stdout.trim()
      debugLog(`npm root -g returned: ${npmModules}`)

      if (npmModules) {
        const parent = path.dirname(npmModules)
        let cliPath: string

        if (isWindows) {
          // On Windows, check for .cmd file first (npm creates these for global packages)
          cliPath = path.join(parent, `${executable}.cmd`)
          if (!fs.existsSync(cliPath)) {
            // Also check without extension or .exe
            cliPath = path.join(parent, `${executable}.exe`)
            if (!fs.existsSync(cliPath)) {
              cliPath = path.join(parent, executable)
            }
          }
        } else {
          cliPath = path.join(parent, 'bin', executable)
        }

        if (fs.existsSync(cliPath)) {
          debugLog(`Found in npm global: ${cliPath}`)
          return cliPath
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      debugLog(`npm root -g failed: ${errMsg}`)
    }

    // 2. Fallback: Check common npm global paths directly
    debugLog('Trying npm global fallback paths...')
    const fallbackPaths = isWindows
      ? [
          path.join(os.homedir(), 'AppData', 'Roaming', 'npm', `${executable}.cmd`),
          path.join(os.homedir(), 'AppData', 'Local', 'npm', `${executable}.cmd`),
          path.join(process.env.APPDATA || '', 'npm', `${executable}.cmd`),
          path.join(os.homedir(), 'AppData', 'Roaming', 'npm', `${executable}.exe`),
          path.join(os.homedir(), 'AppData', 'Roaming', 'npm', executable),
        ]
      : [
          path.join(os.homedir(), '.npm-global', 'bin', executable),
          '/usr/local/lib/node_modules/.bin/' + executable,
          '/usr/local/bin/' + executable,
        ]

    for (const fallbackPath of fallbackPaths) {
      debugLog(`Checking npm fallback path: ${fallbackPath}`)
      if (fallbackPath && fs.existsSync(fallbackPath)) {
        debugLog(`Found in npm fallback: ${fallbackPath}`)
        return fallbackPath
      }
    }

    return null
  }

  /**
   * Find in NVM paths (Unix only)
   * Searches through all installed Node versions, newest first
   */
  private async findInNvm(executable: string): Promise<string | null> {
    if (isWindows) {
      // NVM for Windows has different structure, handled in known paths
      return null
    }

    const nvmBinPaths = getNvmBinPaths()

    for (const binPath of nvmBinPaths) {
      const cliPath = path.join(binPath, executable)
      if (fs.existsSync(cliPath)) {
        debugLog(`Found in NVM: ${cliPath}`)
        return cliPath
      }
    }

    return null
  }

  /**
   * Find in known installation paths
   */
  private async findInKnownPaths(tool: CLIType): Promise<string | null> {
    const paths = this.getDetectionPaths(tool)

    for (const candidatePath of paths) {
      if (fs.existsSync(candidatePath)) {
        debugLog(`Found in known path: ${candidatePath}`)
        return candidatePath
      }
    }

    return null
  }

  /**
   * Find via PowerShell Get-Command (Windows fallback)
   */
  private async findViaPowerShell(executable: string): Promise<string | null> {
    if (!isWindows) return null

    debugLog(`Trying PowerShell Get-Command for ${executable}...`)

    try {
      // Use PowerShell to find the command
      const psCommand = `Get-Command ${executable} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${psCommand}"`, {
        timeout: COMMAND_TIMEOUT,
        env: getAugmentedEnv(),
        encoding: 'utf8',
        shell: true, // Ensure proper shell context
      } as any) as unknown as { stdout: string; stderr: string }

      const foundPath = stdout.trim()
      if (foundPath && fs.existsSync(foundPath)) {
        debugLog(`Found via PowerShell: ${foundPath}`)
        return foundPath
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      debugLog(`PowerShell Get-Command failed: ${errMsg}`)
    }

    return null
  }

  /**
   * Get platform-specific detection paths
   */
  private getDetectionPaths(tool: CLIType): string[] {
    const homeDir = os.homedir()
    const config = this.getConfig(tool)
    const exe = config.executable

    if (isWindows) {
      return [
        // npm global paths (most common)
        path.join(homeDir, 'AppData', 'Roaming', 'npm', `${exe}.cmd`),
        path.join(homeDir, 'AppData', 'Local', 'npm', `${exe}.cmd`),
        // npm without extension
        path.join(homeDir, 'AppData', 'Roaming', 'npm', exe),
        path.join(homeDir, 'AppData', 'Local', 'npm', exe),
        // Local bin with .exe
        path.join(homeDir, '.local', 'bin', `${exe}.exe`),
        path.join(homeDir, '.local', 'bin', exe),
        // Scoop
        path.join(homeDir, 'scoop', 'shims', `${exe}.cmd`),
        path.join(homeDir, 'scoop', 'shims', exe),
        // Program Files (Claude-specific)
        ...(tool === 'claude_code'
          ? [
              path.join(homeDir, 'AppData', 'Local', 'Programs', 'claude', 'claude.exe'),
              'C:\\Program Files\\Claude\\claude.exe',
              'C:\\Program Files (x86)\\Claude\\claude.exe',
            ]
          : []),
      ]
    } else if (isMacOS) {
      return [
        // Homebrew paths (already checked, but keep as fallback)
        `/opt/homebrew/bin/${exe}`,
        `/usr/local/bin/${exe}`,
        // User local paths
        path.join(homeDir, '.local', 'bin', exe),
        path.join(homeDir, '.npm-global', 'bin', exe),
        path.join(homeDir, 'bin', exe),
        // MacPorts
        `/opt/local/bin/${exe}`,
      ]
    } else {
      // Linux
      return [
        // Standard paths
        `/usr/local/bin/${exe}`,
        `/usr/bin/${exe}`,
        // User local paths
        path.join(homeDir, '.local', 'bin', exe),
        path.join(homeDir, '.npm-global', 'bin', exe),
        path.join(homeDir, 'bin', exe),
        // Snap
        `/snap/bin/${exe}`,
      ]
    }
  }

  // ============================================================================
  // CLI Execution
  // ============================================================================

  /**
   * Execute CLI command with proper handling for .cmd/.bat files
   */
  private async executeCLI(
    cliPath: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string }> {
    const augmentedEnv = getAugmentedEnv([path.dirname(cliPath)])
    const needsShell =
      isWindows &&
      (cliPath.toLowerCase().endsWith('.cmd') || cliPath.toLowerCase().endsWith('.bat'))

    debugLog(`Executing CLI: ${cliPath} with args: ${args.join(' ')}`)

    if (needsShell) {
      // Windows .cmd/.bat: Use shell execution
      // Quote the path if it contains spaces, args are passed as-is
      const quotedPath = cliPath.includes(' ') ? `"${cliPath}"` : cliPath
      const fullCommand = `${quotedPath} ${args.join(' ')}`

      debugLog(`Windows shell command: ${fullCommand}`)

      // Use exec with shell: true for proper .cmd execution
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await execAsync(fullCommand, {
        timeout: COMMAND_TIMEOUT,
        env: augmentedEnv,
        shell: true,
        encoding: 'utf8',
      } as any) as unknown as { stdout: string; stderr: string }

      debugLog(`Shell execution success, stdout length: ${result.stdout.length}`)
      return result
    } else {
      // Direct execution for native executables
      return execFileAsync(cliPath, args, {
        timeout: COMMAND_TIMEOUT,
        env: augmentedEnv,
      })
    }
  }

  /**
   * Validate CLI and get version
   */
  private async validateCLI(cliPath: string): Promise<CLIValidation> {
    try {
      const { stdout } = await this.executeCLI(cliPath, ['--version'])
      const version = this.extractVersion(stdout)

      return { valid: true, version }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      debugLog(`Validation failed for ${cliPath}: ${errMsg}`)
      return {
        valid: false,
        version: null,
        error: errMsg,
      }
    }
  }

  // ============================================================================
  // Version Management
  // ============================================================================

  /**
   * Fetch latest version from npm registry (with caching)
   */
  private async fetchLatestVersion(tool: CLIType): Promise<string> {
    // Check cache first
    const cached = this.versionCache.get(tool)
    if (cached && Date.now() - cached.timestamp < VERSION_CACHE_TTL) {
      return cached.version
    }

    const config = this.getConfig(tool)
    const url = `https://registry.npmjs.org/${config.npmPackage}/latest`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT)

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = (await response.json()) as { version?: string }

      if (data.version) {
        // Update cache
        this.versionCache.set(tool, { version: data.version, timestamp: Date.now() })
        return data.version
      }

      throw new Error('No version found in response')
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  /**
   * Extract version number from CLI output
   */
  private extractVersion(output: string): string | null {
    // Try to match semantic version pattern
    const match = output.match(/(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/)
    if (match) {
      return match[1]
    }

    // Fallback: return first line
    return output.split('\n')[0]?.trim() || null
  }

  /**
   * Compare versions: returns true if current < latest
   */
  private compareVersions(current: string, latest: string): boolean {
    try {
      const parse = (v: string) => {
        const match = v.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?/)
        if (!match) return null
        return {
          major: parseInt(match[1]),
          minor: parseInt(match[2]),
          patch: parseInt(match[3]),
          prerelease: match[4] || null,
        }
      }

      const curr = parse(current)
      const lat = parse(latest)

      if (!curr || !lat) {
        // Fallback to simple string comparison
        return current !== latest
      }

      // Compare major.minor.patch
      if (curr.major !== lat.major) return curr.major < lat.major
      if (curr.minor !== lat.minor) return curr.minor < lat.minor
      if (curr.patch !== lat.patch) return curr.patch < lat.patch

      // If same version, prerelease is considered older than release
      if (curr.prerelease && !lat.prerelease) return true
      if (!curr.prerelease && lat.prerelease) return false

      return false
    } catch {
      return false
    }
  }

  // ============================================================================
  // Error Classification
  // ============================================================================

  /**
   * Classify error message into error type
   */
  private classifyError(message: string): CLIError {
    const lowerMessage = message.toLowerCase()

    // Rate limit
    if (/rate.?limit|too many requests|429/i.test(message)) {
      const retryMatch = message.match(/retry.?after:?\s*(\d+)/i)
      return {
        type: 'rate_limit',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: retryMatch ? parseInt(retryMatch[1]) * 1000 : 60000,
      }
    }

    // Auth failure
    if (/unauthorized|invalid.*key|authentication.*fail|401/i.test(message)) {
      return {
        type: 'auth_failure',
        message: 'Authentication failed. Please check your API key.',
      }
    }

    // Network error
    if (/econnrefused|etimedout|network|socket|dns/i.test(message)) {
      return {
        type: 'network_error',
        message: 'Network connection failed. Please check your internet connection.',
      }
    }

    // Timeout
    if (/timeout|timed out/i.test(message)) {
      return {
        type: 'timeout',
        message: 'Command timed out. The CLI may be unresponsive.',
      }
    }

    // Not found
    if (/not found|enoent|no such file/i.test(message)) {
      return {
        type: 'not_found',
        message: 'CLI executable not found.',
      }
    }

    // Default
    return {
      type: 'execution_failed',
      message: 'Failed to execute CLI command.',
      details: message,
    }
  }

  // ============================================================================
  // Configuration Helpers
  // ============================================================================

  private getConfig(tool: CLIType) {
    const configs: Record<CLIType, { name: string; executable: string; npmPackage: string }> = {
      claude_code: {
        name: 'Claude Code CLI',
        executable: 'claude',
        npmPackage: '@anthropic-ai/claude-code',
      },
      gemini_cli: {
        name: 'Gemini CLI',
        executable: 'gemini',
        npmPackage: '@google/gemini-cli',
      },
    }
    return configs[tool]
  }

  private getInstallCommand(tool: CLIType): string {
    // Claude Code has switched to native installer
    if (tool === 'claude_code') {
      if (isWindows) {
        return 'irm https://claude.ai/install.ps1 | iex'
      }
      return 'curl -fsSL https://claude.ai/install.sh | bash'
    }
    // Gemini CLI still uses npm
    const config = this.getConfig(tool)
    return `npm install -g ${config.npmPackage}`
  }

  private getUpdateCommand(tool: CLIType): string | null {
    // Claude Code uses its own update command
    if (tool === 'claude_code') {
      return 'claude update'
    }
    // Gemini CLI uses npm update (same as install)
    return null
  }
}

// Export singleton instance getter
export function getCLIToolManager(): CLIToolManager {
  return CLIToolManager.getInstance()
}
