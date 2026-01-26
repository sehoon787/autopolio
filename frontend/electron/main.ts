import { app, BrowserWindow, ipcMain, shell, protocol } from 'electron'
import { spawn, ChildProcess, execFile, exec } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import { promisify } from 'util'
import serve from 'electron-serve'

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

// Custom protocol for OAuth callback
const PROTOCOL_NAME = 'autopolio'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================================
// CLI DETECTION - Auto-Claude style implementation
// ============================================================================

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

// Platform detection
const isWindows = process.platform === 'win32'
const isMacOS = process.platform === 'darwin'

// Cache for latest versions (avoid hammering npm registry)
let cachedClaudeVersion: { version: string; timestamp: number } | null = null
let cachedGeminiVersion: { version: string; timestamp: number } | null = null
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

// Claude Code installation commands per platform
const CLAUDE_INSTALL_COMMANDS: Record<string, string> = {
  win32: 'npm install -g @anthropic-ai/claude-code',
  darwin: 'npm install -g @anthropic-ai/claude-code',
  linux: 'npm install -g @anthropic-ai/claude-code',
}

// Gemini CLI installation command
const GEMINI_INSTALL_COMMAND = 'npm install -g @google/gemini-cli'

/**
 * Get Claude CLI detection paths (Auto-Claude style)
 */
function getClaudeDetectionPaths(): string[] {
  const homeDir = os.homedir()

  if (isWindows) {
    return [
      path.join(homeDir, 'AppData', 'Local', 'Programs', 'claude', 'claude.exe'),
      path.join(homeDir, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
      path.join(homeDir, '.local', 'bin', 'claude.exe'),
      'C:\\Program Files\\Claude\\claude.exe',
      'C:\\Program Files (x86)\\Claude\\claude.exe',
    ]
  } else if (isMacOS) {
    return [
      '/opt/homebrew/bin/claude',  // Apple Silicon
      '/usr/local/bin/claude',      // Intel Mac
      path.join(homeDir, '.local', 'bin', 'claude'),
      path.join(homeDir, 'bin', 'claude'),
    ]
  } else {
    return [
      path.join(homeDir, '.local', 'bin', 'claude'),
      '/usr/local/bin/claude',
      path.join(homeDir, 'bin', 'claude'),
    ]
  }
}

/**
 * Get Gemini CLI detection paths
 */
function getGeminiDetectionPaths(): string[] {
  const homeDir = os.homedir()

  if (isWindows) {
    return [
      path.join(homeDir, 'AppData', 'Roaming', 'npm', 'gemini.cmd'),
      path.join(homeDir, 'AppData', 'Local', 'npm', 'gemini.cmd'),
    ]
  } else if (isMacOS) {
    return [
      '/opt/homebrew/bin/gemini',
      '/usr/local/bin/gemini',
      path.join(homeDir, '.npm-global', 'bin', 'gemini'),
    ]
  } else {
    return [
      path.join(homeDir, '.local', 'bin', 'gemini'),
      '/usr/local/bin/gemini',
      path.join(homeDir, '.npm-global', 'bin', 'gemini'),
    ]
  }
}

/**
 * Find executable in PATH using where/which
 */
async function findInPath(executable: string): Promise<string | null> {
  try {
    if (isWindows) {
      // Try 'where' command
      const { stdout } = await execAsync(`where ${executable}`, { timeout: 5000 })
      const firstPath = stdout.trim().split('\n')[0]
      if (firstPath && fs.existsSync(firstPath)) {
        return firstPath
      }
    } else {
      const { stdout } = await execAsync(`which ${executable}`, { timeout: 5000 })
      const foundPath = stdout.trim()
      if (foundPath && fs.existsSync(foundPath)) {
        return foundPath
      }
    }
  } catch {
    // Not found in PATH
  }
  return null
}

/**
 * Get npm global bin path
 */
async function getNpmGlobalPath(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('npm root -g', { timeout: 10000 })
    const npmModules = stdout.trim()
    if (npmModules) {
      const parent = path.dirname(npmModules)
      if (isWindows) {
        return parent // Windows: scripts are in the same folder
      } else {
        return path.join(parent, 'bin')
      }
    }
  } catch {
    // npm not available
  }
  return null
}

/**
 * Validate CLI and get version
 */
async function validateCLI(cliPath: string): Promise<{ valid: boolean; version: string | null }> {
  try {
    const needsShell = isWindows && (cliPath.endsWith('.cmd') || cliPath.endsWith('.bat'))

    let version: string
    if (needsShell) {
      // Use shell for .cmd/.bat files on Windows
      const { stdout } = await execAsync(`"${cliPath}" --version`, { timeout: 10000 })
      version = stdout.trim()
    } else {
      const { stdout } = await execFileAsync(cliPath, ['--version'], { timeout: 10000 })
      version = stdout.trim()
    }

    // Extract version number
    const match = version.match(/(\d+\.\d+\.\d+)/)
    return { valid: true, version: match ? match[1] : version.split('\n')[0] }
  } catch (error) {
    console.log(`[CLI] Failed to validate ${cliPath}:`, error)
    return { valid: false, version: null }
  }
}

/**
 * Detect Claude Code CLI (Auto-Claude style multi-level detection)
 */
async function detectClaudeCLI(): Promise<CLIStatus> {
  const result: CLIStatus = {
    tool: 'claude_code',
    installed: false,
    version: null,
    latest_version: null,
    is_outdated: false,
    path: null,
    install_command: CLAUDE_INSTALL_COMMANDS[process.platform] || CLAUDE_INSTALL_COMMANDS.linux,
    platform: process.platform,
  }

  console.log('[Claude CLI] Starting detection...')

  // 1. Try to find in system PATH first (most reliable)
  let foundPath = await findInPath('claude')

  // 2. Check npm global path
  if (!foundPath) {
    const npmGlobal = await getNpmGlobalPath()
    if (npmGlobal) {
      const claudePath = isWindows
        ? path.join(npmGlobal, 'claude.cmd')
        : path.join(npmGlobal, 'claude')
      if (fs.existsSync(claudePath)) {
        foundPath = claudePath
        console.log('[Claude CLI] Found in npm global:', foundPath)
      }
    }
  }

  // 3. Check known installation paths
  if (!foundPath) {
    for (const candidatePath of getClaudeDetectionPaths()) {
      if (fs.existsSync(candidatePath)) {
        foundPath = candidatePath
        console.log('[Claude CLI] Found in known path:', foundPath)
        break
      }
    }
  }

  // 4. Validate found path
  if (foundPath) {
    const validation = await validateCLI(foundPath)
    if (validation.valid) {
      result.installed = true
      result.path = foundPath
      result.version = validation.version
      console.log(`[Claude CLI] Validated: ${foundPath} v${validation.version}`)
    }
  }

  // 5. Fetch latest version from npm (with cache)
  try {
    result.latest_version = await getLatestClaudeVersion()
    if (result.version && result.latest_version) {
      result.is_outdated = compareVersions(result.version, result.latest_version)
    }
  } catch (error) {
    console.log('[Claude CLI] Failed to fetch latest version:', error)
    result.latest_version = 'unknown'
  }

  console.log('[Claude CLI] Detection result:', result)
  return result
}

/**
 * Detect Gemini CLI
 */
async function detectGeminiCLI(): Promise<CLIStatus> {
  const result: CLIStatus = {
    tool: 'gemini_cli',
    installed: false,
    version: null,
    latest_version: null,
    is_outdated: false,
    path: null,
    install_command: GEMINI_INSTALL_COMMAND,
    platform: process.platform,
  }

  console.log('[Gemini CLI] Starting detection...')

  // 1. Try to find in system PATH first
  let foundPath = await findInPath('gemini')

  // 2. Check npm global path
  if (!foundPath) {
    const npmGlobal = await getNpmGlobalPath()
    if (npmGlobal) {
      const geminiPath = isWindows
        ? path.join(npmGlobal, 'gemini.cmd')
        : path.join(npmGlobal, 'gemini')
      if (fs.existsSync(geminiPath)) {
        foundPath = geminiPath
        console.log('[Gemini CLI] Found in npm global:', foundPath)
      }
    }
  }

  // 3. Check known installation paths
  if (!foundPath) {
    for (const candidatePath of getGeminiDetectionPaths()) {
      if (fs.existsSync(candidatePath)) {
        foundPath = candidatePath
        console.log('[Gemini CLI] Found in known path:', foundPath)
        break
      }
    }
  }

  // 4. Validate found path
  if (foundPath) {
    const validation = await validateCLI(foundPath)
    if (validation.valid) {
      result.installed = true
      result.path = foundPath
      result.version = validation.version
      console.log(`[Gemini CLI] Validated: ${foundPath} v${validation.version}`)
    }
  }

  // 5. Fetch latest version from npm (with cache)
  try {
    result.latest_version = await getLatestGeminiVersion()
    if (result.version && result.latest_version) {
      result.is_outdated = compareVersions(result.version, result.latest_version)
    }
  } catch (error) {
    console.log('[Gemini CLI] Failed to fetch latest version:', error)
    result.latest_version = 'unknown'
  }

  console.log('[Gemini CLI] Detection result:', result)
  return result
}

/**
 * Fetch latest Claude Code version from npm registry
 */
async function getLatestClaudeVersion(): Promise<string> {
  // Check cache
  if (cachedClaudeVersion && Date.now() - cachedClaudeVersion.timestamp < CACHE_DURATION) {
    return cachedClaudeVersion.version
  }

  const response = await fetch('https://registry.npmjs.org/@anthropic-ai/claude-code/latest', {
    headers: { 'Accept': 'application/json' },
  })
  const data = await response.json() as { version?: string }

  if (data.version) {
    cachedClaudeVersion = { version: data.version, timestamp: Date.now() }
    return data.version
  }
  throw new Error('Could not fetch latest version')
}

/**
 * Fetch latest Gemini CLI version from npm registry
 */
async function getLatestGeminiVersion(): Promise<string> {
  // Check cache
  if (cachedGeminiVersion && Date.now() - cachedGeminiVersion.timestamp < CACHE_DURATION) {
    return cachedGeminiVersion.version
  }

  const response = await fetch('https://registry.npmjs.org/@google/gemini-cli/latest', {
    headers: { 'Accept': 'application/json' },
  })
  const data = await response.json() as { version?: string }

  if (data.version) {
    cachedGeminiVersion = { version: data.version, timestamp: Date.now() }
    return data.version
  }
  throw new Error('Could not fetch latest version')
}

/**
 * Compare versions: returns true if current < latest
 */
function compareVersions(current: string, latest: string): boolean {
  try {
    const currentParts = current.replace('v', '').split('.').map(Number)
    const latestParts = latest.replace('v', '').split('.').map(Number)

    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const curr = currentParts[i] || 0
      const lat = latestParts[i] || 0
      if (curr < lat) return true
      if (curr > lat) return false
    }
    return false
  } catch {
    return false
  }
}

// CLI status cache
let claudeCLICache: CLIStatus | null = null
let geminiCLICache: CLIStatus | null = null

// Python backend process
let pythonProcess: ChildProcess | null = null
const BACKEND_PORT = 8000
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`

// Main window reference
let mainWindow: BrowserWindow | null = null

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
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    // Production: use electron-serve to serve static files via app:// protocol
    loadURL(mainWindow)
    // Open DevTools for debugging
    mainWindow.webContents.openDevTools()
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Handle OAuth callback redirects
  // When backend redirects to http://localhost:5173/..., intercept and handle properly
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsedUrl = new URL(url)

      // Check if this is an OAuth callback (redirected from backend to frontend)
      // Support multiple ports: 5173 (default), 5174 (fallback), 5199 (custom), etc.
      const oauthPorts = ['5173', '5174', '5199', '3000', '5000']
      if (parsedUrl.hostname === 'localhost' && oauthPorts.includes(parsedUrl.port)) {
        event.preventDefault()  // Always prevent navigation to localhost:5173

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
          mainWindow?.loadURL('http://localhost:5173' + targetPath + parsedUrl.search)
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

function startPythonBackend(): Promise<void> {
  return new Promise(async (resolve) => {
    console.log('Checking if backend is running...')

    // Quick check if backend is already running
    try {
      const response = await fetch(`${BACKEND_URL}/health`)
      if (response.ok) {
        console.log('Backend is already running')
        resolve()
        return
      }
    } catch {
      console.log('Backend not detected, attempting to start...')
    }

    // Find the project root (where api/ folder is)
    const projectRoot = isDev
      ? path.resolve(__dirname, '../..')  // electron/main.ts -> frontend -> project root
      : path.resolve(process.resourcesPath)

    console.log(`Starting backend from: ${projectRoot}`)

    const pythonPath = process.platform === 'win32' ? 'python' : 'python3'

    pythonProcess = spawn(pythonPath, [
      '-m', 'uvicorn',
      'api.main:app',
      '--host', '127.0.0.1',
      '--port', String(BACKEND_PORT),
      ...(isDev ? ['--reload'] : []),
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
      shell: true,  // Needed for Windows
    })

    let started = false

    pythonProcess.stdout?.on('data', (data) => {
      const output = data.toString()
      console.log(`Backend: ${output}`)
      if (!started && output.includes('Uvicorn running')) {
        started = true
        resolve()
      }
    })

    pythonProcess.stderr?.on('data', (data) => {
      const output = data.toString()
      console.error(`Backend: ${output}`)
      // Uvicorn logs to stderr
      if (!started && output.includes('Uvicorn running')) {
        started = true
        resolve()
      }
    })

    pythonProcess.on('error', (error) => {
      console.error('Failed to start backend:', error)
      // Still resolve to allow the app to show error state
      resolve()
    })

    pythonProcess.on('close', (code) => {
      console.log(`Backend exited with code ${code}`)
      pythonProcess = null
    })

    // Timeout: resolve anyway after 15 seconds
    setTimeout(() => {
      if (!started) {
        console.log('Backend startup timed out, continuing anyway...')
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
}

// IPC Handlers
ipcMain.handle('is-electron', () => true)
ipcMain.handle('get-backend-url', () => BACKEND_URL)
ipcMain.handle('get-platform', () => process.platform)
ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('get-user-data-path', () => app.getPath('userData'))

// CLI Detection IPC Handlers (Auto-Claude style - runs in main process)
ipcMain.handle('get-claude-cli-status', async () => {
  // Return cached result if available, otherwise detect
  if (!claudeCLICache) {
    claudeCLICache = await detectClaudeCLI()
  }
  return claudeCLICache
})

ipcMain.handle('get-gemini-cli-status', async () => {
  // Return cached result if available, otherwise detect
  if (!geminiCLICache) {
    geminiCLICache = await detectGeminiCLI()
  }
  return geminiCLICache
})

ipcMain.handle('refresh-cli-status', async () => {
  // Force refresh both CLI statuses
  claudeCLICache = await detectClaudeCLI()
  geminiCLICache = await detectGeminiCLI()
  return {
    claude: claudeCLICache,
    gemini: geminiCLICache,
  }
})

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
          ? `http://localhost:5173${redirectPath}?user_id=${userId}&github_connected=${githubConnected}`
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

// App lifecycle
app.whenReady().then(async () => {
  try {
    await startPythonBackend()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  } catch (error) {
    console.error('Failed to start app:', error)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopPythonBackend()
    app.quit()
  }
})

app.on('before-quit', () => {
  stopPythonBackend()
})

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  stopPythonBackend()
})
