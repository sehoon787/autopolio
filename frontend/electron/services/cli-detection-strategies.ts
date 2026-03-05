/**
 * CLI Detection Strategies - Stateless helper functions for CLI detection
 *
 * Extracted from CLIToolManager for modularity.
 * All functions are pure/stateless — they take parameters and return results.
 */

import { exec, execFile, spawn } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import os from 'os'
import type {
  CLIType,
  CLIValidation,
  CLIError,
} from '../types/cli.js'
import {
  isWindows,
  isMacOS,
  COMMAND_TIMEOUT,
  CLI_DEBUG,
} from '../types/cli.js'
import { getAugmentedEnv, getNvmBinPaths } from '../utils/env-utils.js'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

// ============================================================================
// Debug Logger
// ============================================================================

export function debugLog(message: string, ...args: unknown[]): void {
  if (CLI_DEBUG) {
    console.log(`[CLIToolManager] ${message}`, ...args)
  }
}

// ============================================================================
// Configuration Helpers
// ============================================================================

export function getConfig(tool: CLIType): { name: string; executable: string; npmPackage: string } {
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
    codex_cli: {
      name: 'Codex CLI',
      executable: 'codex',
      npmPackage: '@openai/codex',
    },
    github_cli: {
      name: 'GitHub CLI',
      executable: 'gh',
      npmPackage: '', // Not an npm package
    },
  }
  return configs[tool]
}

export function getInstallCommand(tool: CLIType): string {
  // Claude Code has switched to native installer
  if (tool === 'claude_code') {
    if (isWindows) {
      return 'irm https://claude.ai/install.ps1 | iex'
    }
    return 'curl -fsSL https://claude.ai/install.sh | bash'
  }
  // GitHub CLI uses OS package managers
  if (tool === 'github_cli') {
    if (isWindows) {
      return 'winget install --id GitHub.cli'
    }
    if (isMacOS) {
      return 'brew install gh'
    }
    return 'sudo apt install gh'  // Linux
  }
  // Gemini CLI still uses npm
  const config = getConfig(tool)
  return `npm install -g ${config.npmPackage}`
}

export function getUpdateCommand(tool: CLIType): string | null {
  // Claude Code uses its own update command
  if (tool === 'claude_code') {
    return 'claude update'
  }
  // GitHub CLI uses OS package managers for updates
  if (tool === 'github_cli') {
    if (isWindows) {
      return 'winget upgrade --id GitHub.cli'
    }
    if (isMacOS) {
      return 'brew upgrade gh'
    }
    return 'sudo apt update && sudo apt upgrade gh'
  }
  // Gemini CLI uses npm update (same as install)
  return null
}

// ============================================================================
// Path Finding
// ============================================================================

/**
 * Find in Homebrew paths (macOS only)
 */
export async function findInHomebrew(executable: string): Promise<string | null> {
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
export async function findInSystemPath(executable: string): Promise<string | null> {
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
      // Skip local node_modules paths (project-local installs, often outdated)
      if (foundPath && foundPath.includes('node_modules') && !foundPath.includes('npm/node_modules')) {
        debugLog(`Skipping local node_modules path: ${foundPath}`)
        return null
      }
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
export async function findInNpmGlobal(executable: string): Promise<string | null> {
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
export async function findInNvm(executable: string): Promise<string | null> {
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
export async function findInKnownPaths(tool: CLIType): Promise<string | null> {
  const paths = getDetectionPaths(tool)

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
export async function findViaPowerShell(executable: string): Promise<string | null> {
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
export function getDetectionPaths(tool: CLIType): string[] {
  const homeDir = os.homedir()
  const config = getConfig(tool)
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
export async function executeCLI(
  cliPath: string,
  args: string[],
  timeout: number = COMMAND_TIMEOUT
): Promise<{ stdout: string; stderr: string }> {
  const augmentedEnv = getAugmentedEnv([path.dirname(cliPath)])
  const isCmdFile =
    isWindows &&
    (cliPath.toLowerCase().endsWith('.cmd') || cliPath.toLowerCase().endsWith('.bat'))

  debugLog(`Executing CLI: ${cliPath} with args: ${args.join(' ')}`)

  if (isCmdFile) {
    // Windows .cmd/.bat: build a single shell command string with manually
    // quoted args, then run via spawn(shell:true, stdio:['ignore',...]).
    // - exec() hangs because CLI tools wait for stdin when no TTY is attached.
    // - spawn(cliPath, argsArray, {shell:true}) joins args with spaces,
    //   splitting space-containing prompts into separate words.
    // - Using a pre-quoted command string + stdio:['ignore'] solves both.
    const escapedArgs = args.map(a =>
      a.includes(' ') ? `"${a}"` : a
    ).join(' ')
    const command = `"${cliPath}" ${escapedArgs}`
    debugLog(`Executing via spawn shell: ${command}`)
    return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(command, {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout,
        env: augmentedEnv,
        windowsHide: true,
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
      child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
      child.on('close', (code: number | null) => {
        if (code === 0) resolve({ stdout, stderr })
        else reject(new Error(`Command failed (exit ${code}): ${command}\n${stderr}`))
      })
      child.on('error', reject)
    })
  }

  try {
    return await execFileAsync(cliPath, args, {
      timeout,
      env: augmentedEnv,
    })
  } catch (error: any) {
    // Rethrow with stderr included for better diagnostics
    const stderr = error?.stderr || ''
    if (stderr) {
      debugLog(`CLI stderr: ${stderr.substring(0, 500)}`)
    }
    throw error
  }
}

/**
 * Validate CLI and get version
 */
export async function validateCLI(cliPath: string): Promise<CLIValidation> {
  try {
    const { stdout } = await executeCLI(cliPath, ['--version'])
    const version = extractVersion(stdout)

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
// Version Helpers
// ============================================================================

/**
 * Extract version number from CLI output
 */
export function extractVersion(output: string): string | null {
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
export function compareVersions(current: string, latest: string): boolean {
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
export function classifyError(message: string): CLIError {
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
