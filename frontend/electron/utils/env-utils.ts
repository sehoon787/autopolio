/**
 * Environment Utilities - PATH augmentation for CLI detection
 *
 * When Electron apps are launched from GUI (not terminal), they inherit
 * minimal PATH environment. This module augments PATH with common
 * binary installation paths to ensure CLI tools can be found.
 *
 * Based on Auto-Claude implementation pattern.
 */

import os from 'os'
import path from 'path'
import fs from 'fs'

// ============================================================================
// Common Binary Paths by Platform
// ============================================================================

const COMMON_BIN_PATHS: Record<string, string[]> = {
  win32: [
    // Node.js default installation
    'C:\\Program Files\\nodejs',
    // npm global paths
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
    path.join(os.homedir(), 'AppData', 'Local', 'npm'),
    // Scoop package manager
    path.join(os.homedir(), 'scoop', 'shims'),
    'C:\\scoop\\shims',
    // Chocolatey
    'C:\\ProgramData\\chocolatey\\bin',
    // User local bin
    path.join(os.homedir(), '.local', 'bin'),
    // Common Program Files locations
    'C:\\Program Files\\Git\\cmd',
    'C:\\Program Files\\Git\\bin',
  ],
  darwin: [
    // Homebrew (Apple Silicon - most common now)
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    // Homebrew (Intel Mac)
    '/usr/local/bin',
    '/usr/local/sbin',
    // User local paths
    path.join(os.homedir(), '.local', 'bin'),
    path.join(os.homedir(), '.npm-global', 'bin'),
    path.join(os.homedir(), 'bin'),
    // MacPorts
    '/opt/local/bin',
  ],
  linux: [
    // Standard paths
    '/usr/local/bin',
    '/usr/bin',
    // User local paths
    path.join(os.homedir(), '.local', 'bin'),
    path.join(os.homedir(), '.npm-global', 'bin'),
    path.join(os.homedir(), 'bin'),
    // Snap packages
    '/snap/bin',
    // Flatpak exports
    '/var/lib/flatpak/exports/bin',
    path.join(os.homedir(), '.local', 'share', 'flatpak', 'exports', 'bin'),
  ],
}

// ============================================================================
// NVM Paths
// ============================================================================

/**
 * Get NVM node versions directory
 */
export function getNvmDir(): string | null {
  const platform = process.platform

  if (platform === 'win32') {
    // NVM for Windows uses different structure
    const nvmHome = process.env.NVM_HOME
    if (nvmHome) {
      return nvmHome
    }
    // Default NVM for Windows location
    const defaultPath = path.join(os.homedir(), 'AppData', 'Roaming', 'nvm')
    return defaultPath
  } else {
    // Unix-like systems
    const nvmDir = process.env.NVM_DIR || path.join(os.homedir(), '.nvm')
    return path.join(nvmDir, 'versions', 'node')
  }
}

/**
 * Get all NVM node bin paths sorted by version (newest first)
 */
export function getNvmBinPaths(): string[] {
  const nvmDir = getNvmDir()
  if (!nvmDir) return []

  try {
    if (!fs.existsSync(nvmDir)) {
      return []
    }

    if (process.platform === 'win32') {
      // NVM for Windows: nvm/vX.Y.Z
      const versions = fs.readdirSync(nvmDir)
        .filter((v: string) => /^v?\d+\.\d+\.\d+$/.test(v))
        .sort(compareVersionsDesc)

      return versions.map((v: string) => path.join(nvmDir, v))
    } else {
      // Unix: .nvm/versions/node/vX.Y.Z/bin
      const versions = fs.readdirSync(nvmDir)
        .filter((v: string) => /^v\d+\.\d+\.\d+$/.test(v))
        .sort(compareVersionsDesc)

      return versions.map((v: string) => path.join(nvmDir, v, 'bin'))
    }
  } catch {
    return []
  }
}

/**
 * Compare version strings in descending order (newest first)
 */
function compareVersionsDesc(a: string, b: string): number {
  const parseVersion = (v: string) => {
    const match = v.match(/v?(\d+)\.(\d+)\.(\d+)/)
    if (!match) return [0, 0, 0]
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
  }

  const [aMajor, aMinor, aPatch] = parseVersion(a)
  const [bMajor, bMinor, bPatch] = parseVersion(b)

  if (bMajor !== aMajor) return bMajor - aMajor
  if (bMinor !== aMinor) return bMinor - aMinor
  return bPatch - aPatch
}

// ============================================================================
// Environment Augmentation
// ============================================================================

/**
 * Get augmented environment with additional PATH entries
 *
 * @param extraPaths - Additional paths to prepend (highest priority)
 * @returns ProcessEnv with augmented PATH
 */
export function getAugmentedEnv(extraPaths: string[] = []): NodeJS.ProcessEnv {
  const platform = process.platform as 'win32' | 'darwin' | 'linux'
  const commonPaths = COMMON_BIN_PATHS[platform] || []
  const nvmPaths = getNvmBinPaths()
  const separator = platform === 'win32' ? ';' : ':'

  const existingPath = process.env.PATH || ''

  // Combine all paths, filtering out duplicates and non-existent paths
  const allNewPaths = [...extraPaths, ...nvmPaths, ...commonPaths]
  const uniqueNewPaths = allNewPaths.filter((p, index) => {
    // Remove duplicates within new paths
    if (allNewPaths.indexOf(p) !== index) return false
    // Don't add if already in existing PATH
    if (existingPath.includes(p)) return false
    return true
  })

  const augmentedPath = [...uniqueNewPaths, existingPath].join(separator)

  return {
    ...process.env,
    PATH: augmentedPath,
  }
}

/**
 * Expand environment variables in a string
 *
 * Windows: %VARIABLE% -> value
 * Unix: $VARIABLE or ${VARIABLE} -> value
 */
export function expandEnvVariables(str: string): string {
  return str.replace(/%([^%]+)%|\$\{?(\w+)\}?/g, (_, winVar, unixVar) => {
    const varName = winVar || unixVar
    return process.env[varName] || ''
  })
}

/**
 * Get the PATH separator for current platform
 */
export function getPathSeparator(): string {
  return process.platform === 'win32' ? ';' : ':'
}

/**
 * Log augmented environment for debugging
 */
export function logAugmentedEnv(label: string = 'AugmentedEnv'): void {
  const env = getAugmentedEnv()
  const separator = getPathSeparator()
  const paths = (env.PATH || '').split(separator)

  console.log(`[${label}] PATH entries (${paths.length} total):`)
  paths.slice(0, 20).forEach((p, i) => {
    console.log(`  ${i + 1}. ${p}`)
  })
  if (paths.length > 20) {
    console.log(`  ... and ${paths.length - 20} more`)
  }
}
