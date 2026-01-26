// ============================================================================
// Electron Main Process - Autopolio
// ============================================================================
console.log('[Main] Starting Electron main process...')

import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import serve from 'electron-serve'

console.log('[Main] Core Electron modules loaded')

// Import CLI services
import { getCLIToolManager } from './services/cli-tool-manager.js'
import { getAgentProcessManager } from './services/agent-process-manager.js'
import type { CLIType, CLIStartConfig, OutputData } from './types/cli.js'

console.log('[Main] CLI modules imported successfully')

// Custom protocol for OAuth callback
const PROTOCOL_NAME = 'autopolio'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
    const manager = getCLIToolManager()
    console.log('[IPC] CLIToolManager instance obtained')
    const result = await manager.detectCLI('claude_code')
    console.log('[IPC] get-claude-cli-status result:', JSON.stringify(result, null, 2))
    return result
  } catch (error) {
    console.error('[IPC] get-claude-cli-status CRITICAL error:', error)
    console.error('[IPC] Error stack:', error instanceof Error ? error.stack : 'No stack')
    // Return a default "not installed" status on error with debug info
    return {
      tool: 'claude_code',
      installed: false,
      version: null,
      latest_version: null,
      is_outdated: false,
      path: null,
      install_command: 'npm install -g @anthropic-ai/claude-code',
      platform: process.platform,
      _error: error instanceof Error ? error.message : String(error), // Debug field
    }
  }
})

ipcMain.handle('get-gemini-cli-status', async () => {
  console.log('[IPC] get-gemini-cli-status called')
  try {
    const manager = getCLIToolManager()
    console.log('[IPC] CLIToolManager instance obtained')
    const result = await manager.detectCLI('gemini_cli')
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
      platform: process.platform,
      _error: error instanceof Error ? error.message : String(error), // Debug field
    }
  }
})

ipcMain.handle('refresh-cli-status', async () => {
  console.log('[IPC] refresh-cli-status called')
  try {
    const manager = getCLIToolManager()
    const result = await manager.refreshAll()
    console.log('[IPC] refresh-cli-status result:', result)
    return result
  } catch (error) {
    console.error('[IPC] refresh-cli-status error:', error)
    throw error
  }
})

// ============================================================================
// IPC Handlers - CLI Test (NEW)
// ============================================================================

ipcMain.handle('cli:test', async (_, tool: CLIType) => {
  console.log(`[IPC] cli:test called for ${tool}`)
  const manager = getCLIToolManager()
  return manager.testCLI(tool)
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
