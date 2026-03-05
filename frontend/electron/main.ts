// ============================================================================
// Electron Main Process - Autopolio
// ============================================================================
console.log('[Main] Starting Electron main process...')

import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import yaml from 'js-yaml'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import serve from 'electron-serve'

console.log('[Main] Core Electron modules loaded')

// Import CLI services
import { getAgentProcessManager } from './services/agent-process-manager.js'

console.log('[Main] CLI modules imported successfully')

// Import backend manager
import {
  initBackendManager,
  startPythonBackend,
  stopPythonBackend,
} from './backend-manager.js'

// Import IPC registration functions
import {
  registerCLIDetectionIPC,
  getCachedCLIStatus,
  setCachedCLIStatus,
} from './ipc/cli-detection-ipc.js'
import { registerCLIProcessIPC } from './ipc/cli-process-ipc.js'
import { registerGitHubCLIIPC } from './ipc/github-cli-ipc.js'
import { registerCLIAuthIPC } from './ipc/cli-auth-ipc.js'

// Import CLI tool manager for prefetch
import { getCLIToolManager } from './services/cli-tool-manager.js'

// Custom protocol for OAuth callback
const PROTOCOL_NAME = 'autopolio'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================================
// Configuration
// ============================================================================

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
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`
const MAX_BACKEND_RESTARTS = 3

// PID file for tracking backend process
const getPidFilePath = () => path.join(app.getPath('userData'), 'backend.pid')

// Per-install secret key for token encryption
const getConsistentUserDataPath = () =>
  app.isPackaged
    ? app.getPath('userData')
    : path.join(app.getPath('appData'), 'autopolio-frontend')

const getSecretKeyPath = () => path.join(getConsistentUserDataPath(), 'secret.key')

/**
 * Get or create a unique SECRET_KEY for this Electron installation.
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

// Determine if we're in development mode
// ELECTRON_SERVE_STATIC=1 forces production-mode serving (from dist/) even when running from source.
// Used by E2E tests to avoid needing a Vite dev server.
const isDev = !process.env.ELECTRON_SERVE_STATIC && (process.env.NODE_ENV === 'development' || !app.isPackaged)

// Main window reference
let mainWindow: BrowserWindow | null = null

// Setup static file serving for production
const loadURL = serve({ directory: 'dist' })

// ============================================================================
// Initialize Backend Manager
// ============================================================================

initBackendManager({
  backendPort: BACKEND_PORT,
  backendUrl: BACKEND_URL,
  isDev,
  maxRestarts: MAX_BACKEND_RESTARTS,
  getConsistentUserDataPath,
  getOrCreateSecretKey,
  getPidFilePath,
})

// ============================================================================
// CLI Status Prefetch
// ============================================================================

async function prefetchCLIStatus(): Promise<void> {
  try {
    const manager = getCLIToolManager()
    const [claude, gemini, codex] = await Promise.all([
      manager.detectCLI('claude_code').catch(() => null),
      manager.detectCLI('gemini_cli').catch(() => null),
      manager.detectCLI('codex_cli').catch(() => null),
    ])
    setCachedCLIStatus({ claude, gemini, codex })
    console.log('[Main] CLI status prefetched:', {
      claude: claude?.installed ?? 'error',
      gemini: gemini?.installed ?? 'error',
      codex: codex?.installed ?? 'error',
    })
  } catch (error) {
    console.error('[Main] CLI status prefetch failed:', error)
  }
}

// ============================================================================
// Window Creation
// ============================================================================

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
    mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`)
    mainWindow.webContents.openDevTools()
  } else {
    loadURL(mainWindow)
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Handle OAuth callback redirects
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsedUrl = new URL(url)

      const oauthPorts = [String(FRONTEND_PORT), '5174', '5199', '3000', '5000']
      if (parsedUrl.hostname === 'localhost' && oauthPorts.includes(parsedUrl.port)) {
        event.preventDefault()

        const userId = parsedUrl.searchParams.get('user_id')
        const githubConnected = parsedUrl.searchParams.get('github_connected')
        const targetPath = parsedUrl.pathname

        console.log('[OAuth] Callback intercepted:', { userId, githubConnected, targetPath })

        if (userId && githubConnected) {
          mainWindow?.webContents.executeJavaScript(`
            localStorage.setItem('oauth_callback_user_id', '${userId}');
            localStorage.setItem('oauth_callback_github_connected', '${githubConnected}');
            localStorage.setItem('oauth_callback_path', '${targetPath}');
            console.log('[OAuth] Callback data saved to localStorage');
            window.dispatchEvent(new CustomEvent('oauth-callback', {
              detail: { userId: '${userId}', githubConnected: '${githubConnected}' }
            }));
          `)
        }

        if (isDev) {
          mainWindow?.loadURL(`http://localhost:${FRONTEND_PORT}` + targetPath + parsedUrl.search)
        } else {
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

// ============================================================================
// IPC Handlers - Basic
// ============================================================================

ipcMain.handle('is-electron', () => true)
ipcMain.handle('get-backend-url', () => BACKEND_URL)
ipcMain.handle('get-platform', () => process.platform)
ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('get-user-data-path', () => getConsistentUserDataPath())

// ============================================================================
// Register IPC Modules
// ============================================================================

registerCLIDetectionIPC()
registerCLIProcessIPC()
registerGitHubCLIIPC({
  getMainWindow: () => mainWindow,
  isDev,
  frontendPort: FRONTEND_PORT,
})
registerCLIAuthIPC({
  getMainWindow: () => mainWindow,
})

// ============================================================================
// Custom Protocol Handler
// ============================================================================

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
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }

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

    if (parsedUrl.hostname === 'oauth-callback' || parsedUrl.pathname.includes('oauth-callback')) {
      const userId = parsedUrl.searchParams.get('user_id')
      const githubConnected = parsedUrl.searchParams.get('github_connected')
      const redirectPath = parsedUrl.searchParams.get('path') || '/setup/github'

      console.log('[Protocol] OAuth callback:', { userId, githubConnected, redirectPath })

      if (mainWindow && userId && githubConnected) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()

        const targetUrl = isDev
          ? `http://localhost:${FRONTEND_PORT}${redirectPath}?user_id=${userId}&github_connected=${githubConnected}`
          : `app://-${redirectPath}?user_id=${userId}&github_connected=${githubConnected}`

        mainWindow.loadURL(targetUrl)

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
    getAgentProcessManager().stopAll()
    stopPythonBackend()
    app.quit()
  }
})

app.on('before-quit', async () => {
  await getAgentProcessManager().stopAll()
  stopPythonBackend()
})

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught exception:', error)
  await getAgentProcessManager().stopAll()
  stopPythonBackend()
})
