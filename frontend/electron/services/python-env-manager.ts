/**
 * Python Environment Manager for Electron
 * 
 * Manages bundled Python runtime and backend execution.
 * Based on Auto-Claude's architecture pattern.
 */

import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, ChildProcess, execSync } from 'child_process'
import { EventEmitter } from 'events'
import { fileURLToPath } from 'url'

// ES Module compatibility: define __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Platform-specific configurations
const PLATFORM_CONFIGS: Record<string, { pythonBinary: string; pipBinary: string }> = {
  'win32-x64': {
    pythonBinary: 'python.exe',
    pipBinary: 'Scripts/pip.exe',
  },
  'darwin-arm64': {
    pythonBinary: 'bin/python3',
    pipBinary: 'bin/pip3',
  },
  'darwin-x64': {
    pythonBinary: 'bin/python3',
    pipBinary: 'bin/pip3',
  },
  'linux-x64': {
    pythonBinary: 'bin/python3',
    pipBinary: 'bin/pip3',
  },
}

export interface PythonEnvStatus {
  ready: boolean
  pythonPath: string | null
  sitePackagesPath: string | null
  backendPath: string | null
  usingBundled: boolean
  error?: string
}

/**
 * Get the current platform key
 */
function getPlatformKey(): string {
  const platform = process.platform
  const arch = process.arch
  
  if (platform === 'win32') {
    return 'win32-x64'
  } else if (platform === 'darwin') {
    return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  } else if (platform === 'linux') {
    return 'linux-x64'
  }
  
  throw new Error(`Unsupported platform: ${platform}-${arch}`)
}

/**
 * Python Environment Manager
 */
export class PythonEnvManager extends EventEmitter {
  private pythonPath: string | null = null
  private sitePackagesPath: string | null = null
  private backendPath: string | null = null
  private usingBundled: boolean = false
  private initialized: boolean = false
  
  /**
   * Initialize the Python environment
   */
  async initialize(): Promise<PythonEnvStatus> {
    if (this.initialized) {
      return this.getStatus()
    }
    
    console.log('[PythonEnvManager] Initializing...')
    
    try {
      // Find backend path
      this.backendPath = this.findBackendPath()
      if (!this.backendPath) {
        throw new Error('Backend not found')
      }
      console.log('[PythonEnvManager] Backend path:', this.backendPath)
      
      // Try to use bundled Python first (for packaged apps)
      if (app.isPackaged && this.hasBundledPython()) {
        console.log('[PythonEnvManager] Using bundled Python')
        this.pythonPath = this.getBundledPythonPath()
        this.sitePackagesPath = this.getBundledSitePackagesPath()
        this.usingBundled = true
      } else {
        // Fallback to system Python
        console.log('[PythonEnvManager] Using system Python')
        this.pythonPath = this.findSystemPython()
        this.sitePackagesPath = null // Use system packages
        this.usingBundled = false
      }
      
      if (!this.pythonPath) {
        throw new Error('Python not found')
      }
      
      console.log('[PythonEnvManager] Python path:', this.pythonPath)
      console.log('[PythonEnvManager] Site packages:', this.sitePackagesPath || '(system)')
      
      this.initialized = true
      return this.getStatus()
    } catch (error) {
      console.error('[PythonEnvManager] Initialization failed:', error)
      return {
        ready: false,
        pythonPath: null,
        sitePackagesPath: null,
        backendPath: null,
        usingBundled: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
  
  /**
   * Get current status
   */
  getStatus(): PythonEnvStatus {
    return {
      ready: this.initialized && !!this.pythonPath && !!this.backendPath,
      pythonPath: this.pythonPath,
      sitePackagesPath: this.sitePackagesPath,
      backendPath: this.backendPath,
      usingBundled: this.usingBundled,
    }
  }
  
  /**
   * Find the backend directory
   */
  private findBackendPath(): string | null {
    const possiblePaths = [
      // Packaged app: api is in extraResources (same name as dev to keep internal imports consistent)
      ...(app.isPackaged ? [path.join(process.resourcesPath, 'api')] : []),
      // Dev mode: from electron folder to project root
      path.resolve(__dirname, '..', '..', '..', 'api'),
      // Alternative: relative to app path
      path.resolve(app.getAppPath(), '..', 'api'),
      // Direct from project root
      path.resolve(app.getAppPath(), 'api'),
    ]
    
    for (const p of possiblePaths) {
      // Check if main.py exists
      const mainPyPath = path.join(p, 'main.py')
      if (fs.existsSync(mainPyPath)) {
        return p
      }
    }
    
    console.log('[PythonEnvManager] Checked paths:', possiblePaths)
    return null
  }
  
  /**
   * Check if bundled Python exists
   */
  private hasBundledPython(): boolean {
    const pythonPath = this.getBundledPythonPath()
    return pythonPath !== null && fs.existsSync(pythonPath)
  }
  
  /**
   * Get bundled Python binary path
   */
  private getBundledPythonPath(): string | null {
    if (!app.isPackaged) {
      // Dev mode: check python-runtime folder
      const platformKey = getPlatformKey()
      const config = PLATFORM_CONFIGS[platformKey]
      const devPath = path.resolve(__dirname, '..', '..', 'python-runtime', platformKey, 'python', config.pythonBinary)
      if (fs.existsSync(devPath)) {
        return devPath
      }
      return null
    }
    
    // Packaged app: python is in extraResources
    const platformKey = getPlatformKey()
    const config = PLATFORM_CONFIGS[platformKey]
    return path.join(process.resourcesPath, 'python', config.pythonBinary)
  }
  
  /**
   * Get bundled site-packages path
   */
  private getBundledSitePackagesPath(): string | null {
    if (!app.isPackaged) {
      // Dev mode: check python-runtime folder
      const platformKey = getPlatformKey()
      const devPath = path.resolve(__dirname, '..', '..', 'python-runtime', platformKey, 'site-packages')
      if (fs.existsSync(devPath)) {
        return devPath
      }
      return null
    }
    
    // Packaged app: site-packages is in extraResources
    return path.join(process.resourcesPath, 'site-packages')
  }
  
  /**
   * Find system Python
   */
  private findSystemPython(): string | null {
    const homeDir = process.env.HOME || process.env.USERPROFILE || ''
    const projectRoot = this.backendPath ? path.dirname(this.backendPath) : null
    
    if (projectRoot) {
      const venvPython = process.platform === 'win32'
        ? path.join(projectRoot, 'venv', 'Scripts', 'python.exe')
        : path.join(projectRoot, 'venv', 'bin', 'python3')
      if (fs.existsSync(venvPython)) {
        console.log('[PythonEnvManager] Found project venv:', venvPython)
        return venvPython
      }
      
      const dotVenvPython = process.platform === 'win32'
        ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
        : path.join(projectRoot, '.venv', 'bin', 'python3')
      if (fs.existsSync(dotVenvPython)) {
        console.log('[PythonEnvManager] Found project .venv:', dotVenvPython)
        return dotVenvPython
      }
    }
    
    const knownPaths = process.platform === 'darwin' ? [
      '/opt/homebrew/bin/python3',
      '/usr/local/bin/python3',
      path.join(homeDir, '.local/bin/python3'),
      '/usr/bin/python3',
    ] : process.platform === 'win32' ? [
      path.join(homeDir, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
      path.join(homeDir, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
      'C:\\Python312\\python.exe',
      'C:\\Python311\\python.exe',
    ] : [
      '/usr/bin/python3',
      '/usr/local/bin/python3',
      path.join(homeDir, '.local/bin/python3'),
    ]
    
    for (const pythonPath of knownPaths) {
      if (fs.existsSync(pythonPath)) {
        try {
          const result = execSync(`"${pythonPath}" --version`, { encoding: 'utf8', timeout: 5000 })
          if (result.includes('Python 3')) {
            console.log('[PythonEnvManager] Found Python:', pythonPath)
            return pythonPath
          }
        } catch {
          continue
        }
      }
    }
    
    const commands = process.platform === 'win32'
      ? ['python', 'python3', 'py']
      : ['python3', 'python']
    
    for (const cmd of commands) {
      try {
        const result = execSync(`${cmd} --version`, { encoding: 'utf8', timeout: 5000 })
        if (result.includes('Python 3')) {
          if (process.platform === 'win32') {
            const wherePath = execSync(`where ${cmd}`, { encoding: 'utf8', timeout: 5000 }).trim().split('\n')[0]
            return wherePath
          } else {
            const whichPath = execSync(`which ${cmd}`, { encoding: 'utf8', timeout: 5000 }).trim()
            return whichPath
          }
        }
      } catch {
        continue
      }
    }
    
    return null
  }
  
  /**
   * Get environment variables for Python process
   */
  getPythonEnv(): Record<string, string> {
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      PYTHONUNBUFFERED: '1',
    }
    
    // If using bundled packages, set PYTHONPATH to include both site-packages and project root
    // Project root (parent of backend/) is needed so Python can resolve 'backend.main:app'
    if (this.sitePackagesPath && this.usingBundled) {
      const projectRoot = this.backendPath ? path.dirname(this.backendPath) : ''
      const separator = process.platform === 'win32' ? ';' : ':'
      const pythonPaths = [this.sitePackagesPath]
      if (projectRoot) {
        pythonPaths.push(projectRoot)
      }
      env.PYTHONPATH = pythonPaths.join(separator)
      env.PYTHONNOUSERSITE = '1' // Disable user site-packages
    }
    
    return env
  }
  
  /**
   * Get the Python command and arguments
   */
  getPythonCommand(): { command: string; args: string[] } {
    if (!this.pythonPath) {
      throw new Error('Python not initialized')
    }
    
    return {
      command: this.pythonPath,
      args: [],
    }
  }
  
  /**
   * Get the backend directory path
   */
  getBackendPath(): string {
    if (!this.backendPath) {
      throw new Error('Backend not initialized')
    }
    return this.backendPath
  }
  
  /**
   * Get the project root (parent of backend)
   */
  getProjectRoot(): string {
    if (!this.backendPath) {
      throw new Error('Backend not initialized')
    }
    return path.dirname(this.backendPath)
  }
}

// Singleton instance
let pythonEnvManager: PythonEnvManager | null = null

export function getPythonEnvManager(): PythonEnvManager {
  if (!pythonEnvManager) {
    pythonEnvManager = new PythonEnvManager()
  }
  return pythonEnvManager
}
