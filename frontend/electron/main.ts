// ============================================================================
// Electron Main Process - Autopolio
// ============================================================================
console.log('[Main] Starting Electron main process...')

import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { spawn, execSync, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import yaml from 'js-yaml'
import os from 'os'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import serve from 'electron-serve'

console.log('[Main] Core Electron modules loaded')

// Import CLI services
import { getCLIToolManager } from './services/cli-tool-manager.js'
import { getAgentProcessManager } from './services/agent-process-manager.js'
import type { CLIType, CLIStartConfig, OutputData, CLIStatus } from './types/cli.js'
import { getAugmentedEnv } from './utils/env-utils.js'

// Import Python environment manager
import { getPythonEnvManager } from './services/python-env-manager.js'

console.log('[Main] CLI modules imported successfully')

// Custom protocol for OAuth callback
const PROTOCOL_NAME = 'autopolio'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function loadRuntimeConfig(): any {
  const devPath = path.resolve(__dirname, '..', '..', 'config', 'runtime.yaml')
  const prodPath = path.join(process.resourcesPath, 'config', 'runtime.yaml')
  const candidates = [prodPath, devPath]

  for (const configPath of candidates) {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8')
        return yaml.load(raw) ?? {}
      }
    } catch {
      // ignore and continue
    }
  }

  return {}
}

const runtimeConfig = loadRuntimeConfig()
const externalPorts = runtimeConfig?.ports?.external ?? { frontend: 3035, backend: 8085 }
const FRONTEND_PORT = Number(externalPorts.frontend) || 3035
const BACKEND_PORT = Number(externalPorts.backend) || 8085

// Python backend process
let pythonProcess: ChildProcess | null = null
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`

// Backend restart tracking
let backendRestartCount = 0
const MAX_BACKEND_RESTARTS = 3

// PID file for tracking backend process
const getPidFilePath = () => path.join(app.getPath('userData'), 'backend.pid')

// Per-install secret key for token encryption
const getSecretKeyPath = () => path.join(app.getPath('userData'), 'secret.key')

/**
 * Get or create a unique SECRET_KEY for this Electron installation.
 * Stored in userData directory so each install has its own encryption key.
 * If the existing token was encrypted with the default key, syncGitHubCLI
 * in App.tsx will re-acquire the token via `gh auth token` and re-encrypt
 * with this new key automatically.
 */
function getOrCreateSecretKey(): string {
  const keyPath = getSecretKeyPath()
  if (fs.existsSync(keyPath)) {
    const key = fs.readFileSync(keyPath, 'utf8').trim()
    if (key.length >= 32) return key
  }
  const newKey = crypto.randomBytes(32).toString('base64')
  fs.writeFileSync(keyPath, newKey, { mode: 0o600 })
  console.log('[Main] Generated new SECRET_KEY at', keyPath)
  return newKey
}

// Main window reference
let mainWindow: BrowserWindow | null = null

// Cached CLI status (prefetched at app start)
let cachedCLIStatus: { claude: any | null; gemini: any | null } = { claude: null, gemini: null }

// Cached GitHub CLI path (found during detection)
let cachedGitHubCLIPath: string | null = null

/**
 * Prefetch CLI status in background at app startup.
 * Results are cached and served instantly by IPC handlers.
 */
async function prefetchCLIStatus(): Promise<void> {
  try {
    const manager = getCLIToolManager()
    const [claude, gemini] = await Promise.all([
      manager.detectCLI('claude_code').catch(() => null),
      manager.detectCLI('gemini_cli').catch(() => null),
    ])
    cachedCLIStatus = { claude, gemini }
    console.log('[Main] CLI status prefetched:', {
      claude: claude?.installed ?? 'error',
      gemini: gemini?.installed ?? 'error',
    })
  } catch (error) {
    console.error('[Main] CLI status prefetch failed:', error)
  }
}

// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Setup static file serving for production
const loadURL = serve({ directory: 'dist' })

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Autopolio',
    icon: path.join(__dirname, '../public/icon.png'),
  })

  // Load the app
  if (isDev) {
    // Development: load from Vite dev server
    mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`)
    mainWindow.webContents.openDevTools()
  } else {
    // Production: use electron-serve to serve static files via app:// protocol
    loadURL(mainWindow)
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Handle OAuth callback redirects
  // When backend redirects to http://localhost:<frontend>/..., intercept and handle properly
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsedUrl = new URL(url)

      // Check if this is an OAuth callback (redirected from backend to frontend)
      // Support multiple ports: frontend + legacy fallback ports
      const oauthPorts = [String(FRONTEND_PORT), '5174', '5199', '3000', '5000']
      if (parsedUrl.hostname === 'localhost' && oauthPorts.includes(parsedUrl.port)) {
        event.preventDefault()  // Always prevent navigation to localhost frontend port

        const userId = parsedUrl.searchParams.get('user_id')
        const githubConnected = parsedUrl.searchParams.get('github_connected')
        const targetPath = parsedUrl.pathname

        console.log('[OAuth] Callback intercepted:', { userId, githubConnected, targetPath })

        if (userId && githubConnected) {
          // Save OAuth result to localStorage and dispatch event
          mainWindow?.webContents.executeJavaScript(`
            localStorage.setItem('oauth_callback_user_id', '${userId}');
            localStorage.setItem('oauth_callback_github_connected', '${githubConnected}');
            localStorage.setItem('oauth_callback_path', '${targetPath}');
            console.log('[OAuth] Callback data saved to localStorage');
            // Notify React components
            window.dispatchEvent(new CustomEvent('oauth-callback', {
              detail: { userId: '${userId}', githubConnected: '${githubConnected}' }
            }));
          `)
        }

        // Reload the app at the target path
        if (isDev) {
          mainWindow?.loadURL(`http://localhost:${FRONTEND_PORT}` + targetPath + parsedUrl.search)
        } else {
          // Production: load via app:// protocol
          mainWindow?.loadURL(`app://-${targetPath}${parsedUrl.search}`)
        }
      }
    } catch (error) {
      console.error('[OAuth] Error handling navigation:', error)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function waitForBackend(): Promise<boolean> {
  const maxAttempts = 30 // 30 seconds
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BACKEND_URL}/health`)
      if (response.ok) {
        console.log('Backend is ready')
        return true
      }
    } catch {
      // Backend not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

/**
 * Save backend PID to file for tracking
 */
function savePidFile(pid: number): void {
  try {
    const pidFile = getPidFilePath()
    fs.writeFileSync(pidFile, String(pid))
    console.log(`[PID] Saved backend PID ${pid} to ${pidFile}`)
  } catch (error) {
    console.error('[PID] Failed to save PID file:', error)
  }
}

/**
 * Clean up PID file and optionally kill the tracked process
 */
function cleanupPidFile(): void {
  try {
    const pidFile = getPidFilePath()
    if (fs.existsSync(pidFile)) {
      const pid = fs.readFileSync(pidFile, 'utf8').trim()
      console.log(`[PID] Found PID file with PID: ${pid}`)

      // Try to kill the process if it exists
      if (pid && process.platform === 'win32') {
        spawn('taskkill', ['/pid', pid, '/f', '/t'], { shell: true })
        console.log(`[PID] Sent kill signal to PID ${pid}`)
      } else if (pid) {
        try {
          process.kill(parseInt(pid, 10), 'SIGTERM')
        } catch {
          // Process might not exist
        }
      }

      fs.unlinkSync(pidFile)
      console.log('[PID] Removed PID file')
    }
  } catch (error) {
    console.error('[PID] Error cleaning up PID file:', error)
  }
}

/**
 * Kill any existing process using the backend port
 */
async function killExistingBackend(): Promise<void> {
  console.log('[Cleanup] Checking for existing backend processes...')

  // First, clean up via PID file
  cleanupPidFile()

  if (process.platform === 'win32') {
    // Windows: Find and kill only Python processes using backend port
    // (skip Docker, WSL, and other non-Python processes to avoid conflicts)
    return new Promise((resolve) => {
      const findProcess = spawn('cmd', ['/c', `netstat -ano | findstr :${BACKEND_PORT}`], { shell: true })
      let output = ''

      findProcess.stdout?.on('data', (data) => {
        output += data.toString()
      })

      findProcess.on('close', () => {
        const lines = output.split('\n')
        const pids = new Set<string>()

        for (const line of lines) {
          const listeningMatch = line.match(/LISTENING\s+(\d+)/)
          if (listeningMatch) {
            pids.add(listeningMatch[1])
          }
        }

        if (pids.size === 0) {
          console.log(`[Cleanup] No processes found using port ${BACKEND_PORT}`)
          resolve()
          return
        }

        console.log(`[Cleanup] Found ${pids.size} process(es) using port ${BACKEND_PORT}:`, Array.from(pids))

        // Filter: only kill Python processes (not Docker, WSL, etc.)
        const checkProcess = spawn('powershell', [
          '-Command',
          `Get-Process -Id ${Array.from(pids).join(',')} -ErrorAction SilentlyContinue | Select-Object Id,ProcessName | ConvertTo-Json`
        ])
        let procOutput = ''

        checkProcess.stdout?.on('data', (data) => {
          procOutput += data.toString()
        })

        checkProcess.on('close', () => {
          let pythonPids: string[] = []
          try {
            const procs = JSON.parse(procOutput)
            const procList = Array.isArray(procs) ? procs : [procs]
            pythonPids = procList
              .filter((p: { ProcessName: string }) => p.ProcessName?.toLowerCase() === 'python')
              .map((p: { Id: number }) => String(p.Id))
          } catch {
            // If parsing fails, fall back to killing all found PIDs
            console.log('[Cleanup] Could not identify process names, killing all')
            pythonPids = Array.from(pids)
          }

          if (pythonPids.length > 0) {
            console.log(`[Cleanup] Killing Python process(es):`, pythonPids)
            for (const pid of pythonPids) {
              spawn('taskkill', ['/pid', pid, '/f', '/t'], { shell: true })
            }
            // Wait until port is actually free (poll every 500ms, max 10s)
            const waitForPortFree = () => {
              let attempts = 0
              const maxAttempts = 20
              const check = () => {
                attempts++
                const probe = spawn('cmd', ['/c', `netstat -ano | findstr ":${BACKEND_PORT}" | findstr "LISTENING"`], { shell: true })
                let probeOutput = ''
                probe.stdout?.on('data', (d) => { probeOutput += d.toString() })
                probe.on('close', () => {
                  // Check if any Python process is still listening
                  const stillListening = probeOutput.trim().length > 0
                  if (!stillListening || attempts >= maxAttempts) {
                    if (attempts >= maxAttempts) {
                      console.log(`[Cleanup] Port ${BACKEND_PORT} still in use after ${attempts} attempts, proceeding anyway`)
                    } else {
                      console.log(`[Cleanup] Port ${BACKEND_PORT} freed after ${attempts} attempt(s)`)
                    }
                    resolve()
                  } else {
                    setTimeout(check, 500)
                  }
                })
              }
              // Initial delay to let taskkill take effect
              setTimeout(check, 1000)
            }
            waitForPortFree()
          } else {
            console.log(`[Cleanup] No Python processes on port ${BACKEND_PORT} (Docker/other service may be using it)`)
            resolve()
          }
        })

        checkProcess.on('error', () => {
          console.log('[Cleanup] Failed to identify processes, skipping kill')
          resolve()
        })
      })

      findProcess.on('error', () => {
        console.log('[Cleanup] Failed to check for existing processes')
        resolve()
      })
    })
  } else {
    // Unix: Use lsof to find and kill processes
    return new Promise((resolve) => {
      const findProcess = spawn('lsof', ['-ti', `:${BACKEND_PORT}`], { shell: true })
      let output = ''

      findProcess.stdout?.on('data', (data) => {
        output += data.toString()
      })

      findProcess.on('close', () => {
        const pids = output.trim().split('\n').filter(pid => pid)

        if (pids.length > 0) {
          console.log(`[Cleanup] Found ${pids.length} process(es) using port ${BACKEND_PORT}`)

          for (const pid of pids) {
            try {
              process.kill(parseInt(pid, 10), 'SIGTERM')
            } catch {
              // Process might not exist
            }
          }

          setTimeout(resolve, 2000)
        } else {
          resolve()
        }
      })

      findProcess.on('error', () => resolve())
    })
  }
}

function startPythonBackend(): Promise<void> {
  return new Promise(async (resolve) => {
    console.log('[Backend] Checking if backend is running...')

    // First, check if backend is already running (before any cleanup)
    const backendRunning = await new Promise<boolean>((checkResolve) => {
      import('http').then((http) => {
        const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, { timeout: 3000 }, (res) => {
          console.log('[Backend] Backend responded with status:', res.statusCode)
          checkResolve(res.statusCode === 200)
        })
        req.on('error', (err: Error) => {
          console.log('[Backend] Backend check failed:', err.message)
          checkResolve(false)
        })
        req.on('timeout', () => {
          console.log('[Backend] Backend check timed out')
          req.destroy()
          checkResolve(false)
        })
      }).catch(() => checkResolve(false))
    })

    if (backendRunning) {
      console.log('[Backend] Backend is already running, skipping startup')
      resolve()
      return
    }

    // Kill any existing zombie processes (only if backend not responding)
    await killExistingBackend()

    // Double-check after cleanup
    try {
      const response = await fetch(`${BACKEND_URL}/health`)
      if (response.ok) {
        console.log('[Backend] Backend started externally')
        resolve()
        return
      }
    } catch {
      console.log('[Backend] Backend not detected, attempting to start...')
    }

    // Initialize Python environment manager
    const pythonEnvManager = getPythonEnvManager()
    const envStatus = await pythonEnvManager.initialize()

    if (!envStatus.ready) {
      console.error('[Backend] Python environment not ready:', envStatus.error)
      resolve()
      return
    }

    console.log('[Backend] Python environment ready:')
    console.log(`  - Python: ${envStatus.pythonPath}`)
    console.log(`  - Site packages: ${envStatus.sitePackagesPath || '(system)'}`)
    console.log(`  - Backend: ${envStatus.backendPath}`)
    console.log(`  - Using bundled: ${envStatus.usingBundled}`)

    // Get Python command and environment
    const { command: pythonCommand } = pythonEnvManager.getPythonCommand()
    const pythonEnv = pythonEnvManager.getPythonEnv()
    const projectRoot = pythonEnvManager.getProjectRoot()

    let additionalEnv: Record<string, string> = {}
    if (app.isPackaged) {
      const userDataPath = app.getPath('userData')
      additionalEnv = {
        AUTOPOLIO_BASE_DIR: process.resourcesPath,
        AUTOPOLIO_CONFIG_DIR: path.join(process.resourcesPath, 'config'),
        AUTOPOLIO_DATA_DIR: path.join(userDataPath, 'data'),
        AUTOPOLIO_PLATFORM_TEMPLATES_DIR: path.join(process.resourcesPath, 'data', 'platform_templates'),
        AUTOPOLIO_TEMPLATES_DIR: path.join(process.resourcesPath, 'data', 'templates'),
        DATABASE_URL: `sqlite+aiosqlite:///${path.join(userDataPath, 'data', 'autopolio.db')}`,
      }
      fs.mkdirSync(path.join(userDataPath, 'data'), { recursive: true })
    }

    console.log(`[Backend] Starting backend from: ${projectRoot}`)
    console.log(`[Backend] Using Python: ${pythonCommand}`)

    // Build uvicorn arguments
    const uvicornArgs = [
      '-m', 'uvicorn',
      'api.main:app',
      '--host', '127.0.0.1',
      '--port', String(BACKEND_PORT),
      // In dev mode, limit --reload to only watch 'api' folder to reduce WatchFiles overhead
      ...(isDev ? ['--reload', '--reload-dir', 'api'] : []),
    ]

    pythonProcess = spawn(pythonCommand, uvicornArgs, {
      cwd: projectRoot,
      env: {
        ...pythonEnv,
        ...additionalEnv,
        SECRET_KEY: getOrCreateSecretKey(),
      },
      shell: process.platform === 'win32',  // Needed for Windows
    })

    // Save PID for tracking
    if (pythonProcess.pid) {
      savePidFile(pythonProcess.pid)
    }

    let started = false

    pythonProcess.stdout?.on('data', (data) => {
      const output = data.toString()
      console.log(`[Backend] stdout: ${output}`)
      if (!started && output.includes('Uvicorn running')) {
        started = true
        backendRestartCount = 0  // Reset restart counter on successful start
        resolve()
      }
    })

    pythonProcess.stderr?.on('data', (data) => {
      const output = data.toString()
      console.log(`[Backend] stderr: ${output}`)
      // Uvicorn logs to stderr
      if (!started && output.includes('Uvicorn running')) {
        started = true
        backendRestartCount = 0  // Reset restart counter on successful start
        resolve()
      }
    })

    pythonProcess.on('error', (error) => {
      console.error('[Backend] Failed to start backend:', error)
      // Still resolve to allow the app to show error state
      resolve()
    })

    pythonProcess.on('close', (code) => {
      console.log(`[Backend] Exited with code ${code}`)
      pythonProcess = null

      // Auto-restart on abnormal exit (code !== 0) - max 3 attempts
      if (code !== 0 && code !== null && backendRestartCount < MAX_BACKEND_RESTARTS) {
        backendRestartCount++
        console.log(`[Backend] Abnormal exit detected. Restarting (attempt ${backendRestartCount}/${MAX_BACKEND_RESTARTS})...`)
        setTimeout(() => {
          startPythonBackend().catch((err) => {
            console.error('[Backend] Restart failed:', err)
          })
        }, 2000)
      } else if (code !== 0 && backendRestartCount >= MAX_BACKEND_RESTARTS) {
        console.error(`[Backend] Max restart attempts (${MAX_BACKEND_RESTARTS}) reached. Backend will not be restarted.`)
      }
    })

    // Timeout: resolve anyway after 15 seconds
    setTimeout(() => {
      if (!started) {
        console.log('[Backend] Startup timed out, continuing anyway...')
        resolve()
      }
    }, 15000)
  })
}

function stopPythonBackend() {
  if (pythonProcess) {
    console.log('Stopping backend...')

    if (process.platform === 'win32') {
      // Windows: taskkill to terminate process tree
      spawn('taskkill', ['/pid', String(pythonProcess.pid), '/f', '/t'], {
        shell: true,
      })
    } else {
      // Unix: SIGTERM for graceful shutdown
      pythonProcess.kill('SIGTERM')
    }

    pythonProcess = null
  }

  // Always clean up PID file
  cleanupPidFile()
}

// ============================================================================
// IPC Handlers - Basic
// ============================================================================

ipcMain.handle('is-electron', () => true)
ipcMain.handle('get-backend-url', () => BACKEND_URL)
ipcMain.handle('get-platform', () => process.platform)
ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('get-user-data-path', () => app.getPath('userData'))

// ============================================================================
// IPC Handlers - CLI Detection (using CLIToolManager)
// ============================================================================

ipcMain.handle('get-claude-cli-status', async () => {
  console.log('[IPC] get-claude-cli-status called')
  try {
    if (cachedCLIStatus.claude) {
      console.log('[IPC] get-claude-cli-status returning cached result')
      return cachedCLIStatus.claude
    }

    // Platform-specific fast-path detection
    let claudePath: string | null = null
    const homeDir = os.homedir()

    if (process.platform === 'win32') {
      // Windows: npm global paths
      const windowsPaths = [
        path.join(homeDir, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
        path.join(homeDir, 'AppData', 'Local', 'npm', 'claude.cmd'),
      ]
      for (const p of windowsPaths) {
        if (fs.existsSync(p)) {
          claudePath = p
          console.log(`[IPC] Claude found at Windows path: ${p}`)
          break
        }
      }
    } else if (process.platform === 'darwin') {
      // macOS: Check common installation paths (native installer, Homebrew, npm)
      const macosPaths = [
        path.join(homeDir, '.local', 'bin', 'claude'),           // Native installer / pipx
        path.join(homeDir, '.claude', 'local', 'bin', 'claude'), // Alternative native installer
        '/opt/homebrew/bin/claude',                               // Apple Silicon Homebrew
        '/usr/local/bin/claude',                                  // Intel Homebrew
        path.join(homeDir, '.npm-global', 'bin', 'claude'),      // npm global (custom prefix)
      ]
      for (const p of macosPaths) {
        if (fs.existsSync(p)) {
          claudePath = p
          console.log(`[IPC] Claude found at macOS path: ${p}`)
          break
        }
      }
    } else {
      // Linux: Check common paths
      const linuxPaths = [
        path.join(homeDir, '.local', 'bin', 'claude'),
        '/usr/local/bin/claude',
        '/usr/bin/claude',
      ]
      for (const p of linuxPaths) {
        if (fs.existsSync(p)) {
          claudePath = p
          console.log(`[IPC] Claude found at Linux path: ${p}`)
          break
        }
      }
    }

    // If found via fast-path, create status directly
    if (claudePath) {
      console.log('[IPC] Using fast-path detection for Claude CLI')
      const status: CLIStatus = {
        tool: 'claude_code',
        installed: true,
        version: null,
        latest_version: null,
        is_outdated: false,
        path: claudePath,
        install_command: process.platform === 'win32'
          ? 'irm https://claude.ai/install.ps1 | iex'
          : 'curl -fsSL https://claude.ai/install.sh | bash',
        update_command: 'claude update',
        platform: process.platform,
      }
      // Try to get version using the found path
      try {
        const versionOutput = execSync(`"${claudePath}" --version`, { encoding: 'utf8', timeout: 5000 }).trim()
        // Extract version number (e.g., "2.1.36" from "2.1.36 (Claude Code)")
        const versionMatch = versionOutput.match(/^([\d.]+)/)
        status.version = versionMatch ? versionMatch[1] : versionOutput.split(' ')[0]
        console.log(`[IPC] Claude version: ${status.version}`)
      } catch (e) {
        console.log(`[IPC] Could not get version: ${e instanceof Error ? e.message : e}`)
      }
      cachedCLIStatus.claude = status
      return status
    }

    // Fallback to full CLIToolManager detection
    console.log('[IPC] Fast-path not found, using CLIToolManager...')
    const manager = getCLIToolManager()
    const result = await manager.detectCLI('claude_code')
    cachedCLIStatus.claude = result
    console.log('[IPC] get-claude-cli-status result:', JSON.stringify(result, null, 2))
    return result
  } catch (error) {
    console.error('[IPC] get-claude-cli-status CRITICAL error:', error)
    console.error('[IPC] Error stack:', error instanceof Error ? error.stack : 'No stack')
    // Return a default "not installed" status on error with debug info
    const installCommand = process.platform === 'win32'
      ? 'irm https://claude.ai/install.ps1 | iex'
      : 'curl -fsSL https://claude.ai/install.sh | bash'
    return {
      tool: 'claude_code',
      installed: false,
      version: null,
      latest_version: null,
      is_outdated: false,
      path: null,
      install_command: installCommand,
      update_command: 'claude update',
      platform: process.platform,
      _error: error instanceof Error ? error.message : String(error), // Debug field
    }
  }
})

ipcMain.handle('get-gemini-cli-status', async () => {
  console.log('[IPC] get-gemini-cli-status called')
  try {
    if (cachedCLIStatus.gemini) {
      console.log('[IPC] get-gemini-cli-status returning cached result')
      return cachedCLIStatus.gemini
    }

    let geminiPath: string | null = null
    const homeDir = os.homedir()

    if (process.platform === 'win32') {
      const windowsPaths = [
        path.join(homeDir, 'AppData', 'Roaming', 'npm', 'gemini.cmd'),
        path.join(homeDir, 'AppData', 'Local', 'npm', 'gemini.cmd'),
      ]
      for (const p of windowsPaths) {
        if (fs.existsSync(p)) {
          geminiPath = p
          console.log(`[IPC] Gemini found at Windows path: ${p}`)
          break
        }
      }
    } else if (process.platform === 'darwin') {
      const macosPaths = [
        '/opt/homebrew/bin/gemini',
        '/usr/local/bin/gemini',
        path.join(homeDir, '.local', 'bin', 'gemini'),
        path.join(homeDir, '.npm-global', 'bin', 'gemini'),
      ]
      for (const p of macosPaths) {
        if (fs.existsSync(p)) {
          geminiPath = p
          console.log(`[IPC] Gemini found at macOS path: ${p}`)
          break
        }
      }
    } else {
      const linuxPaths = [
        path.join(homeDir, '.local', 'bin', 'gemini'),
        '/usr/local/bin/gemini',
        '/usr/bin/gemini',
      ]
      for (const p of linuxPaths) {
        if (fs.existsSync(p)) {
          geminiPath = p
          console.log(`[IPC] Gemini found at Linux path: ${p}`)
          break
        }
      }
    }

    if (geminiPath) {
      console.log('[IPC] Using fast-path detection for Gemini CLI')
      const status: CLIStatus = {
        tool: 'gemini_cli',
        installed: true,
        version: null,
        latest_version: null,
        is_outdated: false,
        path: geminiPath,
        install_command: 'npm install -g @google/gemini-cli',
        update_command: null,
        platform: process.platform,
      }
      try {
        const versionOutput = execSync(`"${geminiPath}" --version`, { encoding: 'utf8', timeout: 5000 }).trim()
        status.version = versionOutput.split(' ')[0] || versionOutput
        console.log(`[IPC] Gemini version: ${status.version}`)
      } catch (e) {
        console.log(`[IPC] Could not get version: ${e instanceof Error ? e.message : e}`)
      }
      cachedCLIStatus.gemini = status
      return status
    }

    console.log('[IPC] Fast-path not found, using CLIToolManager...')
    const manager = getCLIToolManager()
    const result = await manager.detectCLI('gemini_cli')
    cachedCLIStatus.gemini = result
    console.log('[IPC] get-gemini-cli-status result:', JSON.stringify(result, null, 2))
    return result
  } catch (error) {
    console.error('[IPC] get-gemini-cli-status CRITICAL error:', error)
    console.error('[IPC] Error stack:', error instanceof Error ? error.stack : 'No stack')
    // Return a default "not installed" status on error with debug info
    return {
      tool: 'gemini_cli',
      installed: false,
      version: null,
      latest_version: null,
      is_outdated: false,
      path: null,
      install_command: 'npm install -g @google/gemini-cli',
      update_command: null,
      platform: process.platform,
      _error: error instanceof Error ? error.message : String(error), // Debug field
    }
  }
})

ipcMain.handle('refresh-cli-status', async () => {
  console.log('[IPC] refresh-cli-status called')
  try {
    // Clear cache so fresh detection runs
    cachedCLIStatus = { claude: null, gemini: null }
    const manager = getCLIToolManager()
    const result = await manager.refreshAll()
    // Re-populate cache from fresh results
    if (result.claude_code) cachedCLIStatus.claude = result.claude_code
    if (result.gemini_cli) cachedCLIStatus.gemini = result.gemini_cli
    console.log('[IPC] refresh-cli-status result:', result)
    return result
  } catch (error) {
    console.error('[IPC] refresh-cli-status error:', error)
    throw error
  }
})

ipcMain.handle('refresh-single-cli-status', async (_, tool: 'claude_code' | 'gemini_cli') => {
  console.log(`[IPC] refresh-single-cli-status called for ${tool}`)
  try {
    const manager = getCLIToolManager()
    // Use refreshCLI instead of detectCLI to bypass cache
    const result = await manager.refreshCLI(tool)
    // Update only the specific cache entry
    if (tool === 'claude_code') {
      cachedCLIStatus.claude = result
    } else {
      cachedCLIStatus.gemini = result
    }
    console.log(`[IPC] refresh-single-cli-status result for ${tool}:`, JSON.stringify(result, null, 2))
    return result
  } catch (error) {
    console.error(`[IPC] refresh-single-cli-status error for ${tool}:`, error)
    throw error
  }
})

// ============================================================================
// IPC Handlers - CLI Test (NEW)
// ============================================================================

ipcMain.handle('cli:test', async (_, tool: CLIType, model?: string) => {
  console.log(`[IPC] cli:test called for ${tool}, model: ${model}`)
  const manager = getCLIToolManager()
  return manager.testCLI(tool, model)
})

// ============================================================================
// IPC Handlers - CLI Process Management (NEW)
// ============================================================================

ipcMain.handle('cli:start', async (_, config: CLIStartConfig) => {
  console.log('[IPC] cli:start called', config)
  const manager = getAgentProcessManager()
  return manager.startCLI(config)
})

ipcMain.handle('cli:stop', async (_, sessionId: string) => {
  console.log(`[IPC] cli:stop called for ${sessionId}`)
  const manager = getAgentProcessManager()
  return manager.stopCLI(sessionId)
})

ipcMain.handle('cli:status', async (_, sessionId: string) => {
  const manager = getAgentProcessManager()
  return manager.getStatus(sessionId)
})

ipcMain.handle('cli:sessions', async () => {
  const manager = getAgentProcessManager()
  return manager.getActiveSessions()
})

ipcMain.handle('cli:send-input', async (_, sessionId: string, input: string) => {
  const manager = getAgentProcessManager()
  return manager.sendInput(sessionId, input)
})

// ============================================================================
// IPC Handlers - CLI Output Streaming (NEW)
// ============================================================================

// Map to track output subscriptions per webContents
const outputSubscriptions = new Map<number, Map<string, () => void>>()

ipcMain.on('cli:subscribe', (event, sessionId: string) => {
  console.log(`[IPC] cli:subscribe called for ${sessionId}`)

  const webContentsId = event.sender.id
  const manager = getAgentProcessManager()

  // Get or create subscription map for this webContents
  let subscriptions = outputSubscriptions.get(webContentsId)
  if (!subscriptions) {
    subscriptions = new Map()
    outputSubscriptions.set(webContentsId, subscriptions)
  }

  // Unsubscribe from previous subscription for this session if exists
  const existingUnsubscribe = subscriptions.get(sessionId)
  if (existingUnsubscribe) {
    existingUnsubscribe()
  }

  // Subscribe to output
  const unsubscribe = manager.onOutput(sessionId, (data: OutputData) => {
    try {
      if (!event.sender.isDestroyed()) {
        event.sender.send('cli:output', data)
      }
    } catch (e) {
      console.error('[IPC] Failed to send output:', e)
    }
  })

  subscriptions.set(sessionId, unsubscribe)
})

ipcMain.on('cli:unsubscribe', (event, sessionId: string) => {
  console.log(`[IPC] cli:unsubscribe called for ${sessionId}`)

  const webContentsId = event.sender.id
  const subscriptions = outputSubscriptions.get(webContentsId)

  if (subscriptions) {
    const unsubscribe = subscriptions.get(sessionId)
    if (unsubscribe) {
      unsubscribe()
      subscriptions.delete(sessionId)
    }
  }
})

// ============================================================================
// IPC Handlers - GitHub CLI (Device Code Flow)
// ============================================================================

// Track active GitHub auth process
let activeGitHubAuthProcess: ChildProcess | null = null

// Device code pattern from gh CLI output
const DEVICE_CODE_PATTERN = /(?:one-time code|verification code|code):\s*([A-Z0-9]{4}[-\s][A-Z0-9]{4})/i
const DEVICE_URL_PATTERN = /https:\/\/github\.com\/login\/device/i

/**
 * Known installation paths for GitHub CLI on different platforms
 */
const GITHUB_CLI_PATHS = {
  win32: [
    'C:\\Program Files\\GitHub CLI\\gh.exe',           // winget / official installer
    'C:\\Program Files (x86)\\GitHub CLI\\gh.exe',     // 32-bit installer
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'gh', 'bin', 'gh.exe'),  // user install
    path.join(os.homedir(), 'scoop', 'shims', 'gh.exe'),  // scoop
  ],
  darwin: [
    '/opt/homebrew/bin/gh',      // Apple Silicon Homebrew
    '/usr/local/bin/gh',         // Intel Mac Homebrew
  ],
  linux: [
    '/usr/bin/gh',
    '/usr/local/bin/gh',
    path.join(os.homedir(), '.local', 'bin', 'gh'),
  ],
}

/**
 * Detect GitHub CLI (gh) installation
 */
async function detectGitHubCLI(): Promise<{
  installed: boolean
  version: string | null
  path: string | null
  authenticated: boolean
  username: string | null
  scopes: string[]
}> {
  const result = {
    installed: false,
    version: null as string | null,
    path: null as string | null,
    authenticated: false,
    username: null as string | null,
    scopes: [] as string[],
  }

  // Helper to run gh command with a specific path
  const runGhCommand = (ghPath: string, args: string): string | null => {
    try {
      return execSync(`"${ghPath}" ${args}`, { encoding: 'utf8', timeout: 10000 }).trim()
    } catch {
      return null
    }
  }

  try {
    let ghPath: string | null = null
    const platform = process.platform as keyof typeof GITHUB_CLI_PATHS
    const knownPaths = GITHUB_CLI_PATHS[platform] || []

    // On macOS/Linux, check known paths FIRST (fast-path for GUI-launched apps)
    if (process.platform !== 'win32') {
      for (const candidatePath of knownPaths) {
        if (fs.existsSync(candidatePath)) {
          console.log('[GitHub CLI] Found at known path (fast-path):', candidatePath)
          ghPath = candidatePath
          break
        }
      }
    }

    // If not found via fast-path, try to find gh in PATH with augmented environment
    if (!ghPath) {
      try {
        const augmentedEnv = getAugmentedEnv()
        if (process.platform === 'win32') {
          const whereOutput = execSync('where gh', { 
            encoding: 'utf8', 
            timeout: 5000,
            env: augmentedEnv,
          }).trim()
          ghPath = whereOutput.split('\n')[0]
          console.log('[GitHub CLI] Found in PATH:', ghPath)
        } else {
          const whichOutput = execSync('which gh', { 
            encoding: 'utf8', 
            timeout: 5000,
            env: augmentedEnv,
          }).trim()
          ghPath = whichOutput
          console.log('[GitHub CLI] Found in PATH:', ghPath)
        }
      } catch {
        console.log('[GitHub CLI] gh not found in PATH, checking known locations...')
      }
    }

    // Windows fallback: check known paths
    if (!ghPath && process.platform === 'win32') {
      for (const candidatePath of knownPaths) {
        if (fs.existsSync(candidatePath)) {
          console.log('[GitHub CLI] Found at known path:', candidatePath)
          ghPath = candidatePath
          break
        }
      }
    }

    // If still not found, return not installed
    if (!ghPath) {
      console.log('[GitHub CLI] Not found in any known location')
      return result
    }

    // Get version using the found path
    const versionOutput = runGhCommand(ghPath, '--version')
    if (versionOutput) {
      const versionMatch = versionOutput.match(/gh version ([\d.]+)/)
      if (versionMatch) {
        result.installed = true
        result.version = versionMatch[1]
        result.path = ghPath
        console.log('[GitHub CLI] Version:', result.version)
      }
    }

    if (!result.installed) {
      return result
    }

    // Cache the found path for other functions to use
    cachedGitHubCLIPath = ghPath

    // Check authentication status using the found path
    try {
      // gh auth status outputs to stderr, need to capture it
      const authOutput = execSync(`"${ghPath}" auth status 2>&1`, { encoding: 'utf8', timeout: 10000 })
      
      // Check if authenticated
      if (authOutput.includes('Logged in to') || authOutput.includes('✓')) {
        result.authenticated = true
        
        // Extract username from auth status
        const usernameMatch = authOutput.match(/Logged in to github\.com account (\S+)/i)
          || authOutput.match(/Logged in to github\.com as (\S+)/i)
          || authOutput.match(/account (\S+) \(/i)
        if (usernameMatch) {
          result.username = usernameMatch[1].replace(/[()]/g, '')
        }
        
        // Extract scopes
        const scopesMatch = authOutput.match(/Token scopes:?\s*['"]?([^'">\n]+)/i)
        if (scopesMatch) {
          result.scopes = scopesMatch[1].split(',').map(s => s.trim()).filter(Boolean)
        }
      }
    } catch (authError: unknown) {
      // Not authenticated or error checking auth
      const errorMessage = authError instanceof Error ? authError.message : String(authError)
      console.log('[GitHub CLI] Auth check failed:', errorMessage)
      
      // If the error message contains login info, it might still be authenticated
      if (errorMessage.includes('Logged in to')) {
        result.authenticated = true
        const usernameMatch = errorMessage.match(/Logged in to github\.com account (\S+)/i)
          || errorMessage.match(/account (\S+) \(/i)
        if (usernameMatch) {
          result.username = usernameMatch[1].replace(/[()]/g, '')
        }
      }
    }

    console.log('[GitHub CLI] Detection result:', result)
    return result
  } catch (error) {
    console.error('[GitHub CLI] Detection error:', error)
    return result
  }
}

ipcMain.handle('github-cli:status', async () => {
  console.log('[IPC] github-cli:status called')
  try {
    const status = await detectGitHubCLI()
    
    // Determine install command based on platform
    let install_command = ''
    if (process.platform === 'win32') {
      install_command = 'winget install --id GitHub.cli'
    } else if (process.platform === 'darwin') {
      install_command = 'brew install gh'
    } else {
      install_command = 'sudo apt install gh  # or: sudo dnf install gh'
    }

    return {
      ...status,
      install_command,
    }
  } catch (error) {
    console.error('[IPC] github-cli:status error:', error)
    return {
      installed: false,
      version: null,
      path: null,
      authenticated: false,
      username: null,
      scopes: [],
      install_command: process.platform === 'win32' ? 'winget install --id GitHub.cli' : 'brew install gh',
    }
  }
})

/**
 * Get the GitHub CLI path (from cache or detect)
 */
async function getGitHubCLIPath(): Promise<string | null> {
  if (cachedGitHubCLIPath) {
    return cachedGitHubCLIPath
  }
  
  // Detect if not cached
  const status = await detectGitHubCLI()
  return status.path
}

/**
 * Start GitHub OAuth via Device Code Flow using gh CLI
 */
ipcMain.handle('github-cli:start-auth', async () => {
  console.log('[IPC] github-cli:start-auth called')
  
  // Cancel any existing auth process
  if (activeGitHubAuthProcess) {
    activeGitHubAuthProcess.kill()
    activeGitHubAuthProcess = null
  }

  // Get the gh CLI path
  const ghPath = await getGitHubCLIPath()
  if (!ghPath) {
    console.error('[GitHub Auth] gh CLI not found')
    return { success: false, error: 'GitHub CLI not installed' }
  }

  return new Promise((resolve) => {
    let output = ''
    let deviceCode: string | null = null
    let browserOpened = false

    // Use gh auth login with web flow
    const args = ['auth', 'login', '--web', '--scopes', 'repo,read:user']
    console.log('[GitHub Auth] Starting:', ghPath, args.join(' '))

    activeGitHubAuthProcess = spawn(ghPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,  // Don't use shell since we have the full path
    })

    const tryExtractAndOpenBrowser = async () => {
      // Look for device code in output
      const codeMatch = output.match(DEVICE_CODE_PATTERN)
      if (codeMatch && !deviceCode) {
        deviceCode = codeMatch[1].replace(' ', '-')
        console.log('[GitHub Auth] Device code extracted:', deviceCode)

        // Send device code to renderer immediately
        if (mainWindow) {
          mainWindow.webContents.send('github-cli:device-code', {
            device_code: deviceCode,
            user_code: deviceCode,
            verification_uri: 'https://github.com/login/device',
          })
        }

        // Open browser using Electron's shell (bypasses macOS restrictions)
        if (!browserOpened && output.match(DEVICE_URL_PATTERN)) {
          browserOpened = true
          try {
            await shell.openExternal('https://github.com/login/device')
            console.log('[GitHub Auth] Browser opened for device flow')
          } catch (browserError) {
            console.error('[GitHub Auth] Failed to open browser:', browserError)
          }
        }
      }
    }

    activeGitHubAuthProcess.stdout?.on('data', (data) => {
      output += data.toString()
      console.log('[GitHub Auth] stdout:', data.toString().trim())
      tryExtractAndOpenBrowser()
    })

    activeGitHubAuthProcess.stderr?.on('data', (data) => {
      output += data.toString()
      console.log('[GitHub Auth] stderr:', data.toString().trim())
      tryExtractAndOpenBrowser()
    })

    activeGitHubAuthProcess.on('close', async (code) => {
      console.log('[GitHub Auth] Process exited with code:', code)
      activeGitHubAuthProcess = null

      if (code === 0) {
        // Auth successful - get user info
        try {
          const authStatus = execSync(`"${ghPath}" auth status 2>&1`, { encoding: 'utf8', timeout: 5000 })
          
          let username = null
          const usernameMatch = authStatus.match(/Logged in to github\.com account (\S+)/i)
            || authStatus.match(/Logged in to github\.com as (\S+)/i)
            || authStatus.match(/account (\S+) \(/i)
          if (usernameMatch) {
            username = usernameMatch[1].replace(/[()]/g, '')
          }

          // Get the token for API calls
          let token = null
          try {
            token = execSync(`"${ghPath}" auth token`, { encoding: 'utf8', timeout: 5000 }).trim()
          } catch {
            console.log('[GitHub Auth] Could not get token, will use gh CLI for API calls')
          }

          resolve({
            success: true,
            username,
            token,
          })

          // Notify renderer of success
          if (mainWindow) {
            mainWindow.webContents.send('github-cli:auth-complete', {
              success: true,
              username,
              token,
            })
          }
        } catch (error) {
          console.error('[GitHub Auth] Failed to get auth info after login:', error)
          resolve({
            success: true,
            username: null,
            token: null,
          })
        }
      } else {
        resolve({
          success: false,
          error: `Authentication failed (exit code: ${code})`,
        })

        if (mainWindow) {
          mainWindow.webContents.send('github-cli:auth-complete', {
            success: false,
            error: `Authentication failed (exit code: ${code})`,
          })
        }
      }
    })

    activeGitHubAuthProcess.on('error', (error) => {
      console.error('[GitHub Auth] Process error:', error)
      activeGitHubAuthProcess = null
      resolve({
        success: false,
        error: error.message,
      })
    })

    // Return initial status while auth is in progress
    setTimeout(() => {
      if (deviceCode) {
        resolve({
          success: true,
          pending: true,
          device_code: deviceCode,
          verification_uri: 'https://github.com/login/device',
        })
      }
    }, 3000)
  })
})

/**
 * Cancel ongoing GitHub auth
 */
ipcMain.handle('github-cli:cancel-auth', async () => {
  console.log('[IPC] github-cli:cancel-auth called')
  if (activeGitHubAuthProcess) {
    activeGitHubAuthProcess.kill()
    activeGitHubAuthProcess = null
    return { success: true }
  }
  return { success: true, message: 'No active auth process' }
})

/**
 * Logout from GitHub CLI
 */
ipcMain.handle('github-cli:logout', async () => {
  console.log('[IPC] github-cli:logout called')
  try {
    const ghPath = await getGitHubCLIPath()
    if (!ghPath) {
      return { success: false, error: 'GitHub CLI not found' }
    }
    execSync(`"${ghPath}" auth logout --hostname github.com`, { encoding: 'utf8', timeout: 10000, input: 'Y\n' })
    return { success: true }
  } catch (error) {
    console.error('[GitHub CLI] Logout error:', error)
    // Even if logout fails, it might already be logged out
    return { success: true }
  }
})

/**
 * Get GitHub token from gh CLI (for API calls)
 */
ipcMain.handle('github-cli:get-token', async () => {
  console.log('[IPC] github-cli:get-token called')
  try {
    const ghPath = await getGitHubCLIPath()
    if (!ghPath) {
      return { success: false, error: 'GitHub CLI not found' }
    }
    const token = execSync(`"${ghPath}" auth token`, { encoding: 'utf8', timeout: 5000 }).trim()
    return { success: true, token }
  } catch (error) {
    console.error('[GitHub CLI] Get token error:', error)
    return { success: false, error: 'Not authenticated or token not available' }
  }
})

/**
 * Execute a gh api command and parse the paginated JSON output.
 * Returns an array of parsed objects. Silently returns [] on failure.
 */
function execGhApi(ghPath: string, endpoint: string, opts?: { timeout?: number }): any[] {
  const timeout = opts?.timeout ?? 60000
  try {
    const command = `"${ghPath}" api "${endpoint}" --paginate`
    const output = execSync(command, {
      encoding: 'utf8',
      timeout,
      maxBuffer: 50 * 1024 * 1024,
    })
    const results: any[] = []
    for (const part of output.trim().split('\n')) {
      if (!part.trim()) continue
      try {
        const parsed = JSON.parse(part)
        if (Array.isArray(parsed)) {
          results.push(...parsed)
        } else {
          results.push(parsed)
        }
      } catch {
        // skip invalid JSON fragments
      }
    }
    return results
  } catch (error) {
    console.warn(`[GitHub CLI] gh api ${endpoint} failed:`, error instanceof Error ? error.message : error)
    return []
  }
}

/**
 * Execute gh api in a background thread (non-blocking).
 */
function execGhApiAsync(ghPath: string, endpoint: string, opts?: { timeout?: number }): Promise<any[]> {
  return new Promise((resolve) => {
    try {
      resolve(execGhApi(ghPath, endpoint, opts))
    } catch {
      resolve([])
    }
  })
}

/**
 * List GitHub repositories using gh CLI with parallel multi-endpoint aggregation.
 *
 * Fetches from 5 endpoint groups in parallel for ~3-5x speedup:
 *   1. /user/repos  (owner + collaborator + org member)
 *   2. /users/{username}/repos  (public profile repos)
 *   3+5. /user/orgs + /user/memberships/orgs → /orgs/{org}/repos  (merged, deduped)
 *   4. /search/repositories?q=user:{username}  (search fallback)
 */
ipcMain.handle('github-cli:list-repos', async (_) => {
  console.log('[IPC] github-cli:list-repos called (parallel)')
  const startTime = Date.now()
  try {
    const ghPath = await getGitHubCLIPath()
    if (!ghPath) {
      return { success: false, error: 'GitHub CLI not found' }
    }

    // Step 0: Get username + org lists (needed by other steps)
    let username = ''
    try {
      const userInfo = execGhApi(ghPath, '/user')
      if (userInfo.length > 0) {
        username = userInfo[0]?.login || ''
      }
    } catch { /* ignore */ }

    // Get org logins from both sources in parallel
    const [orgs, memberships] = await Promise.all([
      execGhApiAsync(ghPath, '/user/orgs'),
      execGhApiAsync(ghPath, '/user/memberships/orgs'),
    ])

    const orgLogins = new Set<string>()
    for (const org of orgs) {
      if (org?.login) orgLogins.add(org.login)
    }
    for (const m of memberships) {
      const login = m?.organization?.login
      if (login) orgLogins.add(login)
    }

    console.log(`[GitHub CLI] User: ${username}, Orgs: ${orgLogins.size}`)

    // Run all steps in parallel
    const tasks: Promise<any[]>[] = [
      // Step 1: /user/repos
      execGhApiAsync(ghPath, '/user/repos?per_page=100&affiliation=owner,collaborator,organization_member&sort=pushed&direction=desc', { timeout: 120000 }),
    ]

    // Step 2: /users/{username}/repos
    if (username) {
      tasks.push(execGhApiAsync(ghPath, `/users/${username}/repos?per_page=100&sort=pushed&type=all`))
    }

    // Steps 3+5: org repos (deduplicated org logins)
    for (const orgLogin of orgLogins) {
      tasks.push(execGhApiAsync(ghPath, `/orgs/${orgLogin}/repos?per_page=100&sort=pushed&type=all`))
    }

    // Step 4: search
    if (username) {
      tasks.push(
        execGhApiAsync(ghPath, `/search/repositories?q=user:${username}&per_page=100&page=1`).then(results => {
          // Search API wraps results in { items: [...] }
          if (results.length > 0 && results[0]?.items) return results[0].items
          return results
        })
      )
    }

    const allResults = await Promise.all(tasks)

    // Merge and deduplicate
    const seenIds = new Set<number>()
    const allRepos: any[] = []
    for (const repos of allResults) {
      if (!Array.isArray(repos)) continue
      for (const repo of repos) {
        if (repo.id && !seenIds.has(repo.id)) {
          seenIds.add(repo.id)
          allRepos.push(repo)
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[GitHub CLI] Total: ${allRepos.length} repos in ${elapsed}s`)

    // Transform to match backend API format
    const transformedRepos = allRepos.map((repo: any) => ({
      id: repo.id || 0,
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      html_url: repo.html_url,
      clone_url: repo.clone_url,
      language: repo.language || null,
      stargazers_count: repo.stargazers_count || 0,
      forks_count: repo.forks_count || 0,
      created_at: repo.created_at,
      updated_at: repo.updated_at,
      pushed_at: repo.pushed_at,
      fork: repo.fork || false,
      owner: repo.owner?.login || ''
    }))

    return {
      success: true,
      repos: transformedRepos,
      total: transformedRepos.length
    }
  } catch (error) {
    console.error('[GitHub CLI] List repos error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Check if it's an auth error
    if (errorMessage.includes('auth') || errorMessage.includes('login')) {
      return { success: false, error: 'Not authenticated. Please run: gh auth login' }
    }

    return { success: false, error: `Failed to list repos: ${errorMessage}` }
  }
})

// ============================================================================
// Custom Protocol Handler
// ============================================================================

// Register custom protocol for OAuth callback (must be before app.whenReady)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_NAME, process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_NAME)
}

// Handle protocol URL on Windows/Linux (second instance)
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Someone tried to run a second instance, focus our window and handle protocol
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }

    // Handle protocol URL (Windows/Linux)
    const protocolUrl = commandLine.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`))
    if (protocolUrl) {
      handleProtocolUrl(protocolUrl)
    }
  })
}

// Handle protocol URL on macOS
app.on('open-url', (_event, url) => {
  if (url.startsWith(`${PROTOCOL_NAME}://`)) {
    handleProtocolUrl(url)
  }
})

/**
 * Handle custom protocol URL (autopolio://oauth-callback?...)
 */
function handleProtocolUrl(url: string) {
  console.log('[Protocol] Received URL:', url)

  try {
    const parsedUrl = new URL(url)

    // Handle OAuth callback: autopolio://oauth-callback?user_id=...&github_connected=...
    if (parsedUrl.hostname === 'oauth-callback' || parsedUrl.pathname.includes('oauth-callback')) {
      const userId = parsedUrl.searchParams.get('user_id')
      const githubConnected = parsedUrl.searchParams.get('github_connected')
      const redirectPath = parsedUrl.searchParams.get('path') || '/setup/github'

      console.log('[Protocol] OAuth callback:', { userId, githubConnected, redirectPath })

      if (mainWindow && userId && githubConnected) {
        // Focus the window
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()

        // Navigate to the redirect path and inject OAuth data
        const targetUrl = isDev
          ? `http://localhost:${FRONTEND_PORT}${redirectPath}?user_id=${userId}&github_connected=${githubConnected}`
          : `app://-${redirectPath}?user_id=${userId}&github_connected=${githubConnected}`

        mainWindow.loadURL(targetUrl)

        // Also dispatch event after navigation
        setTimeout(() => {
          mainWindow?.webContents.executeJavaScript(`
            localStorage.setItem('oauth_callback_user_id', '${userId}');
            localStorage.setItem('oauth_callback_github_connected', '${githubConnected}');
            window.dispatchEvent(new CustomEvent('oauth-callback', {
              detail: { userId: '${userId}', githubConnected: '${githubConnected}' }
            }));
            console.log('[OAuth] Callback received from protocol handler');
          `)
        }, 1000)
      }
    }
  } catch (error) {
    console.error('[Protocol] Error handling URL:', error)
  }
}

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(async () => {
  console.log('[Main] App is ready, initializing...')
  try {
    await startPythonBackend()
    console.log('[Main] Backend initialization complete')
    createWindow()
    console.log('[Main] Window created')

    // Fire-and-forget: prefetch CLI status in background
    prefetchCLIStatus()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  } catch (error) {
    console.error('[Main] Failed to start app:', error)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Stop all CLI processes
    getAgentProcessManager().stopAll()
    stopPythonBackend()
    app.quit()
  }
})

app.on('before-quit', async () => {
  // Stop all CLI processes before quitting
  await getAgentProcessManager().stopAll()
  stopPythonBackend()
})

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught exception:', error)
  await getAgentProcessManager().stopAll()
  stopPythonBackend()
})
