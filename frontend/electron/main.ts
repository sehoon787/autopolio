import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

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
    // Production: load from built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function startPythonBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isDev) {
      // In development, assume backend is running separately
      console.log('Development mode: Backend should be running separately')
      resolve()
      return
    }

    // Production: Start the Python backend
    const pythonPath = process.platform === 'win32' ? 'python' : 'python3'
    const apiPath = path.join(app.getPath('userData'), '..', 'Autopolio', 'api')

    // Check if bundled Python exists, otherwise use system Python
    const scriptPath = path.join(process.resourcesPath, 'api', 'main.py')

    pythonProcess = spawn(pythonPath, [
      '-m', 'uvicorn',
      'api.main:app',
      '--host', '127.0.0.1',
      '--port', String(BACKEND_PORT),
    ], {
      cwd: path.join(process.resourcesPath),
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
    })

    pythonProcess.stdout?.on('data', (data) => {
      console.log(`Backend: ${data}`)
      if (data.toString().includes('Uvicorn running')) {
        resolve()
      }
    })

    pythonProcess.stderr?.on('data', (data) => {
      console.error(`Backend Error: ${data}`)
    })

    pythonProcess.on('error', (error) => {
      console.error('Failed to start backend:', error)
      reject(error)
    })

    pythonProcess.on('close', (code) => {
      console.log(`Backend exited with code ${code}`)
      pythonProcess = null
    })

    // Set a timeout for backend startup
    setTimeout(() => {
      resolve() // Resolve anyway after timeout
    }, 10000)
  })
}

function stopPythonBackend() {
  if (pythonProcess) {
    pythonProcess.kill()
    pythonProcess = null
  }
}

// IPC Handlers
ipcMain.handle('is-electron', () => true)
ipcMain.handle('get-backend-url', () => BACKEND_URL)
ipcMain.handle('get-platform', () => process.platform)
ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('get-user-data-path', () => app.getPath('userData'))

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
