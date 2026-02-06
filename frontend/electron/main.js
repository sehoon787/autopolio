// ============================================================================
// Electron Main Process - Autopolio
// ============================================================================
console.log('[Main] Starting Electron main process...');
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import serve from 'electron-serve';
console.log('[Main] Core Electron modules loaded');
// Import CLI services
import { getCLIToolManager } from './services/cli-tool-manager.js';
import { getAgentProcessManager } from './services/agent-process-manager.js';
console.log('[Main] CLI modules imported successfully');
// Custom protocol for OAuth callback
const PROTOCOL_NAME = 'autopolio';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Python backend process
let pythonProcess = null;
const BACKEND_PORT = 8000;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
// Backend restart tracking
let backendRestartCount = 0;
const MAX_BACKEND_RESTARTS = 3;
// PID file for tracking backend process
const getPidFilePath = () => path.join(app.getPath('userData'), 'backend.pid');
// Per-install secret key for token encryption
const getSecretKeyPath = () => path.join(app.getPath('userData'), 'secret.key');
/**
 * Get or create a unique SECRET_KEY for this Electron installation.
 * Stored in userData directory so each install has its own encryption key.
 * If the existing token was encrypted with the default key, syncGitHubCLI
 * in App.tsx will re-acquire the token via `gh auth token` and re-encrypt
 * with this new key automatically.
 */
function getOrCreateSecretKey() {
    const keyPath = getSecretKeyPath();
    if (fs.existsSync(keyPath)) {
        const key = fs.readFileSync(keyPath, 'utf8').trim();
        if (key.length >= 32)
            return key;
    }
    const newKey = crypto.randomBytes(32).toString('base64');
    fs.writeFileSync(keyPath, newKey, { mode: 0o600 });
    console.log('[Main] Generated new SECRET_KEY at', keyPath);
    return newKey;
}
// Main window reference
let mainWindow = null;
// Cached CLI status (prefetched at app start)
let cachedCLIStatus = { claude: null, gemini: null };
// Cached GitHub CLI path (found during detection)
let cachedGitHubCLIPath = null;
/**
 * Prefetch CLI status in background at app startup.
 * Results are cached and served instantly by IPC handlers.
 */
async function prefetchCLIStatus() {
    try {
        const manager = getCLIToolManager();
        const [claude, gemini] = await Promise.all([
            manager.detectCLI('claude_code').catch(() => null),
            manager.detectCLI('gemini_cli').catch(() => null),
        ]);
        cachedCLIStatus = { claude, gemini };
        console.log('[Main] CLI status prefetched:', {
            claude: claude?.installed ?? 'error',
            gemini: gemini?.installed ?? 'error',
        });
    }
    catch (error) {
        console.error('[Main] CLI status prefetch failed:', error);
    }
}
// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
// Setup static file serving for production
const loadURL = serve({ directory: 'dist' });
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
    });
    // Load the app
    if (isDev) {
        // Development: load from Vite dev server
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        // Production: use electron-serve to serve static files via app:// protocol
        loadURL(mainWindow);
        // Open DevTools for debugging
        mainWindow.webContents.openDevTools();
    }
    // Open external links in browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
    // Handle OAuth callback redirects
    // When backend redirects to http://localhost:5173/..., intercept and handle properly
    mainWindow.webContents.on('will-navigate', (event, url) => {
        try {
            const parsedUrl = new URL(url);
            // Check if this is an OAuth callback (redirected from backend to frontend)
            // Support multiple ports: 5173 (default), 5174 (fallback), 5199 (custom), etc.
            const oauthPorts = ['5173', '5174', '5199', '3000', '5000'];
            if (parsedUrl.hostname === 'localhost' && oauthPorts.includes(parsedUrl.port)) {
                event.preventDefault(); // Always prevent navigation to localhost:5173
                const userId = parsedUrl.searchParams.get('user_id');
                const githubConnected = parsedUrl.searchParams.get('github_connected');
                const targetPath = parsedUrl.pathname;
                console.log('[OAuth] Callback intercepted:', { userId, githubConnected, targetPath });
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
          `);
                }
                // Reload the app at the target path
                if (isDev) {
                    mainWindow?.loadURL('http://localhost:5173' + targetPath + parsedUrl.search);
                }
                else {
                    // Production: load via app:// protocol
                    mainWindow?.loadURL(`app://-${targetPath}${parsedUrl.search}`);
                }
            }
        }
        catch (error) {
            console.error('[OAuth] Error handling navigation:', error);
        }
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
async function waitForBackend() {
    const maxAttempts = 30; // 30 seconds
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await fetch(`${BACKEND_URL}/health`);
            if (response.ok) {
                console.log('Backend is ready');
                return true;
            }
        }
        catch {
            // Backend not ready yet
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return false;
}
/**
 * Save backend PID to file for tracking
 */
function savePidFile(pid) {
    try {
        const pidFile = getPidFilePath();
        fs.writeFileSync(pidFile, String(pid));
        console.log(`[PID] Saved backend PID ${pid} to ${pidFile}`);
    }
    catch (error) {
        console.error('[PID] Failed to save PID file:', error);
    }
}
/**
 * Clean up PID file and optionally kill the tracked process
 */
function cleanupPidFile() {
    try {
        const pidFile = getPidFilePath();
        if (fs.existsSync(pidFile)) {
            const pid = fs.readFileSync(pidFile, 'utf8').trim();
            console.log(`[PID] Found PID file with PID: ${pid}`);
            // Try to kill the process if it exists
            if (pid && process.platform === 'win32') {
                spawn('taskkill', ['/pid', pid, '/f', '/t'], { shell: true });
                console.log(`[PID] Sent kill signal to PID ${pid}`);
            }
            else if (pid) {
                try {
                    process.kill(parseInt(pid, 10), 'SIGTERM');
                }
                catch {
                    // Process might not exist
                }
            }
            fs.unlinkSync(pidFile);
            console.log('[PID] Removed PID file');
        }
    }
    catch (error) {
        console.error('[PID] Error cleaning up PID file:', error);
    }
}
/**
 * Kill any existing process using the backend port
 */
async function killExistingBackend() {
    console.log('[Cleanup] Checking for existing backend processes...');
    // First, clean up via PID file
    cleanupPidFile();
    if (process.platform === 'win32') {
        // Windows: Find and kill only Python processes using port 8000
        // (skip Docker, WSL, and other non-Python processes to avoid conflicts)
        return new Promise((resolve) => {
            const findProcess = spawn('cmd', ['/c', `netstat -ano | findstr :${BACKEND_PORT}`], { shell: true });
            let output = '';
            findProcess.stdout?.on('data', (data) => {
                output += data.toString();
            });
            findProcess.on('close', () => {
                const lines = output.split('\n');
                const pids = new Set();
                for (const line of lines) {
                    const listeningMatch = line.match(/LISTENING\s+(\d+)/);
                    if (listeningMatch) {
                        pids.add(listeningMatch[1]);
                    }
                }
                if (pids.size === 0) {
                    console.log(`[Cleanup] No processes found using port ${BACKEND_PORT}`);
                    resolve();
                    return;
                }
                console.log(`[Cleanup] Found ${pids.size} process(es) using port ${BACKEND_PORT}:`, Array.from(pids));
                // Filter: only kill Python processes (not Docker, WSL, etc.)
                const checkProcess = spawn('powershell', [
                    '-Command',
                    `Get-Process -Id ${Array.from(pids).join(',')} -ErrorAction SilentlyContinue | Select-Object Id,ProcessName | ConvertTo-Json`
                ]);
                let procOutput = '';
                checkProcess.stdout?.on('data', (data) => {
                    procOutput += data.toString();
                });
                checkProcess.on('close', () => {
                    let pythonPids = [];
                    try {
                        const procs = JSON.parse(procOutput);
                        const procList = Array.isArray(procs) ? procs : [procs];
                        pythonPids = procList
                            .filter((p) => p.ProcessName?.toLowerCase() === 'python')
                            .map((p) => String(p.Id));
                    }
                    catch {
                        // If parsing fails, fall back to killing all found PIDs
                        console.log('[Cleanup] Could not identify process names, killing all');
                        pythonPids = Array.from(pids);
                    }
                    if (pythonPids.length > 0) {
                        console.log(`[Cleanup] Killing Python process(es):`, pythonPids);
                        for (const pid of pythonPids) {
                            spawn('taskkill', ['/pid', pid, '/f', '/t'], { shell: true });
                        }
                        // Wait until port is actually free (poll every 500ms, max 10s)
                        const waitForPortFree = () => {
                            let attempts = 0;
                            const maxAttempts = 20;
                            const check = () => {
                                attempts++;
                                const probe = spawn('cmd', ['/c', `netstat -ano | findstr ":${BACKEND_PORT}" | findstr "LISTENING"`], { shell: true });
                                let probeOutput = '';
                                probe.stdout?.on('data', (d) => { probeOutput += d.toString(); });
                                probe.on('close', () => {
                                    // Check if any Python process is still listening
                                    const stillListening = probeOutput.trim().length > 0;
                                    if (!stillListening || attempts >= maxAttempts) {
                                        if (attempts >= maxAttempts) {
                                            console.log(`[Cleanup] Port ${BACKEND_PORT} still in use after ${attempts} attempts, proceeding anyway`);
                                        }
                                        else {
                                            console.log(`[Cleanup] Port ${BACKEND_PORT} freed after ${attempts} attempt(s)`);
                                        }
                                        resolve();
                                    }
                                    else {
                                        setTimeout(check, 500);
                                    }
                                });
                            };
                            // Initial delay to let taskkill take effect
                            setTimeout(check, 1000);
                        };
                        waitForPortFree();
                    }
                    else {
                        console.log(`[Cleanup] No Python processes on port ${BACKEND_PORT} (Docker/other service may be using it)`);
                        resolve();
                    }
                });
                checkProcess.on('error', () => {
                    console.log('[Cleanup] Failed to identify processes, skipping kill');
                    resolve();
                });
            });
            findProcess.on('error', () => {
                console.log('[Cleanup] Failed to check for existing processes');
                resolve();
            });
        });
    }
    else {
        // Unix: Use lsof to find and kill processes
        return new Promise((resolve) => {
            const findProcess = spawn('lsof', ['-ti', `:${BACKEND_PORT}`], { shell: true });
            let output = '';
            findProcess.stdout?.on('data', (data) => {
                output += data.toString();
            });
            findProcess.on('close', () => {
                const pids = output.trim().split('\n').filter(pid => pid);
                if (pids.length > 0) {
                    console.log(`[Cleanup] Found ${pids.length} process(es) using port ${BACKEND_PORT}`);
                    for (const pid of pids) {
                        try {
                            process.kill(parseInt(pid, 10), 'SIGTERM');
                        }
                        catch {
                            // Process might not exist
                        }
                    }
                    setTimeout(resolve, 2000);
                }
                else {
                    resolve();
                }
            });
            findProcess.on('error', () => resolve());
        });
    }
}
function startPythonBackend() {
    return new Promise(async (resolve) => {
        console.log('Checking if backend is running...');
        // Kill any existing zombie processes first
        await killExistingBackend();
        // Quick check if backend is already running (after cleanup)
        try {
            const response = await fetch(`${BACKEND_URL}/health`);
            if (response.ok) {
                console.log('Backend is already running');
                resolve();
                return;
            }
        }
        catch {
            console.log('Backend not detected, attempting to start...');
        }
        // Find the project root (where api/ folder is)
        const projectRoot = isDev
            ? path.resolve(__dirname, '../..') // electron/main.ts -> frontend -> project root
            : path.resolve(process.resourcesPath);
        console.log(`Starting backend from: ${projectRoot}`);
        // Use virtual environment Python if it exists, otherwise fall back to system python
        const venvPython = process.platform === 'win32'
            ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
            : path.join(projectRoot, '.venv', 'bin', 'python');
        const systemPython = process.platform === 'win32' ? 'python' : 'python3';
        // Check if venv Python exists
        const fs = await import('fs');
        const pythonPath = fs.existsSync(venvPython) ? venvPython : systemPython;
        console.log(`Using Python: ${pythonPath}`);
        pythonProcess = spawn(pythonPath, [
            '-m', 'uvicorn',
            'api.main:app',
            '--host', '127.0.0.1',
            '--port', String(BACKEND_PORT),
            // In dev mode, limit --reload to only watch 'api' folder to reduce WatchFiles overhead
            ...(isDev ? ['--reload', '--reload-dir', 'api'] : []),
        ], {
            cwd: projectRoot,
            env: {
                ...process.env,
                PYTHONUNBUFFERED: '1',
                SECRET_KEY: getOrCreateSecretKey(),
            },
            shell: true, // Needed for Windows
        });
        // Save PID for tracking
        if (pythonProcess.pid) {
            savePidFile(pythonProcess.pid);
        }
        let started = false;
        pythonProcess.stdout?.on('data', (data) => {
            const output = data.toString();
            console.log(`Backend: ${output}`);
            if (!started && output.includes('Uvicorn running')) {
                started = true;
                backendRestartCount = 0; // Reset restart counter on successful start
                resolve();
            }
        });
        pythonProcess.stderr?.on('data', (data) => {
            const output = data.toString();
            console.error(`Backend: ${output}`);
            // Uvicorn logs to stderr
            if (!started && output.includes('Uvicorn running')) {
                started = true;
                backendRestartCount = 0; // Reset restart counter on successful start
                resolve();
            }
        });
        pythonProcess.on('error', (error) => {
            console.error('Failed to start backend:', error);
            // Still resolve to allow the app to show error state
            resolve();
        });
        pythonProcess.on('close', (code) => {
            console.log(`[Backend] Exited with code ${code}`);
            pythonProcess = null;
            // Auto-restart on abnormal exit (code !== 0) - max 3 attempts
            if (code !== 0 && code !== null && backendRestartCount < MAX_BACKEND_RESTARTS) {
                backendRestartCount++;
                console.log(`[Backend] Abnormal exit detected. Restarting (attempt ${backendRestartCount}/${MAX_BACKEND_RESTARTS})...`);
                setTimeout(() => {
                    startPythonBackend().catch((err) => {
                        console.error('[Backend] Restart failed:', err);
                    });
                }, 2000);
            }
            else if (code !== 0 && backendRestartCount >= MAX_BACKEND_RESTARTS) {
                console.error(`[Backend] Max restart attempts (${MAX_BACKEND_RESTARTS}) reached. Backend will not be restarted.`);
            }
        });
        // Timeout: resolve anyway after 15 seconds
        setTimeout(() => {
            if (!started) {
                console.log('Backend startup timed out, continuing anyway...');
                resolve();
            }
        }, 15000);
    });
}
function stopPythonBackend() {
    if (pythonProcess) {
        console.log('Stopping backend...');
        if (process.platform === 'win32') {
            // Windows: taskkill to terminate process tree
            spawn('taskkill', ['/pid', String(pythonProcess.pid), '/f', '/t'], {
                shell: true,
            });
        }
        else {
            // Unix: SIGTERM for graceful shutdown
            pythonProcess.kill('SIGTERM');
        }
        pythonProcess = null;
    }
    // Always clean up PID file
    cleanupPidFile();
}
// ============================================================================
// IPC Handlers - Basic
// ============================================================================
ipcMain.handle('is-electron', () => true);
ipcMain.handle('get-backend-url', () => BACKEND_URL);
ipcMain.handle('get-platform', () => process.platform);
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-user-data-path', () => app.getPath('userData'));
// ============================================================================
// IPC Handlers - CLI Detection (using CLIToolManager)
// ============================================================================
ipcMain.handle('get-claude-cli-status', async () => {
    console.log('[IPC] get-claude-cli-status called');
    try {
        if (cachedCLIStatus.claude) {
            console.log('[IPC] get-claude-cli-status returning cached result');
            return cachedCLIStatus.claude;
        }
        // Direct file existence check for Windows npm global
        const claudePath = path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'claude.cmd');
        const fileExists = fs.existsSync(claudePath);
        console.log(`[IPC] Direct check: path=${claudePath}, exists=${fileExists}`);
        // If file exists directly, create status without complex detection
        if (fileExists) {
            console.log('[IPC] Using direct file detection for Claude CLI');
            const status = {
                tool: 'claude_code',
                installed: true,
                version: null,
                latest_version: null,
                is_outdated: false,
                path: claudePath,
                install_command: 'npm install -g @anthropic-ai/claude-code',
                update_command: 'claude update',
                platform: process.platform,
            };
            // Try to get version
            try {
                const { execSync } = await import('child_process');
                const versionOutput = execSync('claude --version', { encoding: 'utf8', timeout: 5000 }).trim();
                status.version = versionOutput.split(' ')[0] || versionOutput;
                console.log(`[IPC] Claude version: ${status.version}`);
            }
            catch (e) {
                console.log(`[IPC] Could not get version: ${e instanceof Error ? e.message : e}`);
            }
            cachedCLIStatus.claude = status;
            return status;
        }
        const manager = getCLIToolManager();
        const result = await manager.detectCLI('claude_code');
        cachedCLIStatus.claude = result;
        console.log('[IPC] get-claude-cli-status result:', JSON.stringify(result, null, 2));
        return result;
    }
    catch (error) {
        console.error('[IPC] get-claude-cli-status CRITICAL error:', error);
        console.error('[IPC] Error stack:', error instanceof Error ? error.stack : 'No stack');
        // Return a default "not installed" status on error with debug info
        const installCommand = process.platform === 'win32'
            ? 'irm https://claude.ai/install.ps1 | iex'
            : 'curl -fsSL https://claude.ai/install.sh | bash';
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
        };
    }
});
ipcMain.handle('get-gemini-cli-status', async () => {
    console.log('[IPC] get-gemini-cli-status called');
    try {
        if (cachedCLIStatus.gemini) {
            console.log('[IPC] get-gemini-cli-status returning cached result');
            return cachedCLIStatus.gemini;
        }
        // Direct file existence check for Windows npm global
        const geminiPath = path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'gemini.cmd');
        const fileExists = fs.existsSync(geminiPath);
        console.log(`[IPC] Direct check: path=${geminiPath}, exists=${fileExists}`);
        // If file exists directly, create status without complex detection
        if (fileExists) {
            console.log('[IPC] Using direct file detection for Gemini CLI');
            const status = {
                tool: 'gemini_cli',
                installed: true,
                version: null,
                latest_version: null,
                is_outdated: false,
                path: geminiPath,
                install_command: 'npm install -g @google/gemini-cli',
                update_command: null,
                platform: process.platform,
            };
            // Try to get version
            try {
                const { execSync } = await import('child_process');
                const versionOutput = execSync('gemini --version', { encoding: 'utf8', timeout: 5000 }).trim();
                status.version = versionOutput.split(' ')[0] || versionOutput;
                console.log(`[IPC] Gemini version: ${status.version}`);
            }
            catch (e) {
                console.log(`[IPC] Could not get version: ${e instanceof Error ? e.message : e}`);
            }
            cachedCLIStatus.gemini = status;
            return status;
        }
        const manager = getCLIToolManager();
        const result = await manager.detectCLI('gemini_cli');
        cachedCLIStatus.gemini = result;
        console.log('[IPC] get-gemini-cli-status result:', JSON.stringify(result, null, 2));
        return result;
    }
    catch (error) {
        console.error('[IPC] get-gemini-cli-status CRITICAL error:', error);
        console.error('[IPC] Error stack:', error instanceof Error ? error.stack : 'No stack');
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
        };
    }
});
ipcMain.handle('refresh-cli-status', async () => {
    console.log('[IPC] refresh-cli-status called');
    try {
        // Clear cache so fresh detection runs
        cachedCLIStatus = { claude: null, gemini: null };
        const manager = getCLIToolManager();
        const result = await manager.refreshAll();
        // Re-populate cache from fresh results
        if (result.claude_code)
            cachedCLIStatus.claude = result.claude_code;
        if (result.gemini_cli)
            cachedCLIStatus.gemini = result.gemini_cli;
        console.log('[IPC] refresh-cli-status result:', result);
        return result;
    }
    catch (error) {
        console.error('[IPC] refresh-cli-status error:', error);
        throw error;
    }
});
ipcMain.handle('refresh-single-cli-status', async (_, tool) => {
    console.log(`[IPC] refresh-single-cli-status called for ${tool}`);
    try {
        const manager = getCLIToolManager();
        // Use refreshCLI instead of detectCLI to bypass cache
        const result = await manager.refreshCLI(tool);
        // Update only the specific cache entry
        if (tool === 'claude_code') {
            cachedCLIStatus.claude = result;
        }
        else {
            cachedCLIStatus.gemini = result;
        }
        console.log(`[IPC] refresh-single-cli-status result for ${tool}:`, JSON.stringify(result, null, 2));
        return result;
    }
    catch (error) {
        console.error(`[IPC] refresh-single-cli-status error for ${tool}:`, error);
        throw error;
    }
});
// ============================================================================
// IPC Handlers - CLI Test (NEW)
// ============================================================================
ipcMain.handle('cli:test', async (_, tool, model) => {
    console.log(`[IPC] cli:test called for ${tool}, model: ${model}`);
    const manager = getCLIToolManager();
    return manager.testCLI(tool, model);
});
// ============================================================================
// IPC Handlers - CLI Process Management (NEW)
// ============================================================================
ipcMain.handle('cli:start', async (_, config) => {
    console.log('[IPC] cli:start called', config);
    const manager = getAgentProcessManager();
    return manager.startCLI(config);
});
ipcMain.handle('cli:stop', async (_, sessionId) => {
    console.log(`[IPC] cli:stop called for ${sessionId}`);
    const manager = getAgentProcessManager();
    return manager.stopCLI(sessionId);
});
ipcMain.handle('cli:status', async (_, sessionId) => {
    const manager = getAgentProcessManager();
    return manager.getStatus(sessionId);
});
ipcMain.handle('cli:sessions', async () => {
    const manager = getAgentProcessManager();
    return manager.getActiveSessions();
});
ipcMain.handle('cli:send-input', async (_, sessionId, input) => {
    const manager = getAgentProcessManager();
    return manager.sendInput(sessionId, input);
});
// ============================================================================
// IPC Handlers - CLI Output Streaming (NEW)
// ============================================================================
// Map to track output subscriptions per webContents
const outputSubscriptions = new Map();
ipcMain.on('cli:subscribe', (event, sessionId) => {
    console.log(`[IPC] cli:subscribe called for ${sessionId}`);
    const webContentsId = event.sender.id;
    const manager = getAgentProcessManager();
    // Get or create subscription map for this webContents
    let subscriptions = outputSubscriptions.get(webContentsId);
    if (!subscriptions) {
        subscriptions = new Map();
        outputSubscriptions.set(webContentsId, subscriptions);
    }
    // Unsubscribe from previous subscription for this session if exists
    const existingUnsubscribe = subscriptions.get(sessionId);
    if (existingUnsubscribe) {
        existingUnsubscribe();
    }
    // Subscribe to output
    const unsubscribe = manager.onOutput(sessionId, (data) => {
        try {
            if (!event.sender.isDestroyed()) {
                event.sender.send('cli:output', data);
            }
        }
        catch (e) {
            console.error('[IPC] Failed to send output:', e);
        }
    });
    subscriptions.set(sessionId, unsubscribe);
});
ipcMain.on('cli:unsubscribe', (event, sessionId) => {
    console.log(`[IPC] cli:unsubscribe called for ${sessionId}`);
    const webContentsId = event.sender.id;
    const subscriptions = outputSubscriptions.get(webContentsId);
    if (subscriptions) {
        const unsubscribe = subscriptions.get(sessionId);
        if (unsubscribe) {
            unsubscribe();
            subscriptions.delete(sessionId);
        }
    }
});
// ============================================================================
// IPC Handlers - GitHub CLI (Device Code Flow)
// ============================================================================
// Track active GitHub auth process
let activeGitHubAuthProcess = null;
// Device code pattern from gh CLI output
const DEVICE_CODE_PATTERN = /(?:one-time code|verification code|code):\s*([A-Z0-9]{4}[-\s][A-Z0-9]{4})/i;
const DEVICE_URL_PATTERN = /https:\/\/github\.com\/login\/device/i;
/**
 * Known installation paths for GitHub CLI on different platforms
 */
const GITHUB_CLI_PATHS = {
    win32: [
        'C:\\Program Files\\GitHub CLI\\gh.exe', // winget / official installer
        'C:\\Program Files (x86)\\GitHub CLI\\gh.exe', // 32-bit installer
        path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'gh', 'bin', 'gh.exe'), // user install
        path.join(os.homedir(), 'scoop', 'shims', 'gh.exe'), // scoop
    ],
    darwin: [
        '/opt/homebrew/bin/gh', // Apple Silicon Homebrew
        '/usr/local/bin/gh', // Intel Mac Homebrew
    ],
    linux: [
        '/usr/bin/gh',
        '/usr/local/bin/gh',
        path.join(os.homedir(), '.local', 'bin', 'gh'),
    ],
};
/**
 * Detect GitHub CLI (gh) installation
 */
async function detectGitHubCLI() {
    const result = {
        installed: false,
        version: null,
        path: null,
        authenticated: false,
        username: null,
        scopes: [],
    };
    const { execSync } = await import('child_process');
    // Helper to run gh command with a specific path
    const runGhCommand = (ghPath, args) => {
        try {
            return execSync(`"${ghPath}" ${args}`, { encoding: 'utf8', timeout: 10000 }).trim();
        }
        catch {
            return null;
        }
    };
    try {
        let ghPath = null;
        // First, try to find gh in PATH
        try {
            if (process.platform === 'win32') {
                const whereOutput = execSync('where gh', { encoding: 'utf8', timeout: 5000 }).trim();
                ghPath = whereOutput.split('\n')[0];
                console.log('[GitHub CLI] Found in PATH:', ghPath);
            }
            else {
                const whichOutput = execSync('which gh', { encoding: 'utf8', timeout: 5000 }).trim();
                ghPath = whichOutput;
                console.log('[GitHub CLI] Found in PATH:', ghPath);
            }
        }
        catch {
            console.log('[GitHub CLI] gh not found in PATH, checking known locations...');
        }
        // If not found in PATH, check known installation paths
        if (!ghPath) {
            const platform = process.platform;
            const knownPaths = GITHUB_CLI_PATHS[platform] || [];
            for (const candidatePath of knownPaths) {
                if (fs.existsSync(candidatePath)) {
                    console.log('[GitHub CLI] Found at known path:', candidatePath);
                    ghPath = candidatePath;
                    break;
                }
            }
        }
        // If still not found, return not installed
        if (!ghPath) {
            console.log('[GitHub CLI] Not found in any known location');
            return result;
        }
        // Get version using the found path
        const versionOutput = runGhCommand(ghPath, '--version');
        if (versionOutput) {
            const versionMatch = versionOutput.match(/gh version ([\d.]+)/);
            if (versionMatch) {
                result.installed = true;
                result.version = versionMatch[1];
                result.path = ghPath;
                console.log('[GitHub CLI] Version:', result.version);
            }
        }
        if (!result.installed) {
            return result;
        }
        // Cache the found path for other functions to use
        cachedGitHubCLIPath = ghPath;
        // Check authentication status using the found path
        try {
            // gh auth status outputs to stderr, need to capture it
            const authOutput = execSync(`"${ghPath}" auth status 2>&1`, { encoding: 'utf8', timeout: 10000 });
            // Check if authenticated
            if (authOutput.includes('Logged in to') || authOutput.includes('✓')) {
                result.authenticated = true;
                // Extract username from auth status
                const usernameMatch = authOutput.match(/Logged in to github\.com account (\S+)/i)
                    || authOutput.match(/Logged in to github\.com as (\S+)/i)
                    || authOutput.match(/account (\S+) \(/i);
                if (usernameMatch) {
                    result.username = usernameMatch[1].replace(/[()]/g, '');
                }
                // Extract scopes
                const scopesMatch = authOutput.match(/Token scopes:?\s*['"]?([^'">\n]+)/i);
                if (scopesMatch) {
                    result.scopes = scopesMatch[1].split(',').map(s => s.trim()).filter(Boolean);
                }
            }
        }
        catch (authError) {
            // Not authenticated or error checking auth
            const errorMessage = authError instanceof Error ? authError.message : String(authError);
            console.log('[GitHub CLI] Auth check failed:', errorMessage);
            // If the error message contains login info, it might still be authenticated
            if (errorMessage.includes('Logged in to')) {
                result.authenticated = true;
                const usernameMatch = errorMessage.match(/Logged in to github\.com account (\S+)/i)
                    || errorMessage.match(/account (\S+) \(/i);
                if (usernameMatch) {
                    result.username = usernameMatch[1].replace(/[()]/g, '');
                }
            }
        }
        console.log('[GitHub CLI] Detection result:', result);
        return result;
    }
    catch (error) {
        console.error('[GitHub CLI] Detection error:', error);
        return result;
    }
}
ipcMain.handle('github-cli:status', async () => {
    console.log('[IPC] github-cli:status called');
    try {
        const status = await detectGitHubCLI();
        // Determine install command based on platform
        let install_command = '';
        if (process.platform === 'win32') {
            install_command = 'winget install --id GitHub.cli';
        }
        else if (process.platform === 'darwin') {
            install_command = 'brew install gh';
        }
        else {
            install_command = 'sudo apt install gh  # or: sudo dnf install gh';
        }
        return {
            ...status,
            install_command,
        };
    }
    catch (error) {
        console.error('[IPC] github-cli:status error:', error);
        return {
            installed: false,
            version: null,
            path: null,
            authenticated: false,
            username: null,
            scopes: [],
            install_command: process.platform === 'win32' ? 'winget install --id GitHub.cli' : 'brew install gh',
        };
    }
});
/**
 * Get the GitHub CLI path (from cache or detect)
 */
async function getGitHubCLIPath() {
    if (cachedGitHubCLIPath) {
        return cachedGitHubCLIPath;
    }
    // Detect if not cached
    const status = await detectGitHubCLI();
    return status.path;
}
/**
 * Start GitHub OAuth via Device Code Flow using gh CLI
 */
ipcMain.handle('github-cli:start-auth', async () => {
    console.log('[IPC] github-cli:start-auth called');
    // Cancel any existing auth process
    if (activeGitHubAuthProcess) {
        activeGitHubAuthProcess.kill();
        activeGitHubAuthProcess = null;
    }
    // Get the gh CLI path
    const ghPath = await getGitHubCLIPath();
    if (!ghPath) {
        console.error('[GitHub Auth] gh CLI not found');
        return { success: false, error: 'GitHub CLI not installed' };
    }
    return new Promise((resolve) => {
        let output = '';
        let deviceCode = null;
        let browserOpened = false;
        // Use gh auth login with web flow
        const args = ['auth', 'login', '--web', '--scopes', 'repo,read:user'];
        console.log('[GitHub Auth] Starting:', ghPath, args.join(' '));
        activeGitHubAuthProcess = spawn(ghPath, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: false, // Don't use shell since we have the full path
        });
        const tryExtractAndOpenBrowser = async () => {
            // Look for device code in output
            const codeMatch = output.match(DEVICE_CODE_PATTERN);
            if (codeMatch && !deviceCode) {
                deviceCode = codeMatch[1].replace(' ', '-');
                console.log('[GitHub Auth] Device code extracted:', deviceCode);
                // Send device code to renderer immediately
                if (mainWindow) {
                    mainWindow.webContents.send('github-cli:device-code', {
                        device_code: deviceCode,
                        user_code: deviceCode,
                        verification_uri: 'https://github.com/login/device',
                    });
                }
                // Open browser using Electron's shell (bypasses macOS restrictions)
                if (!browserOpened && output.match(DEVICE_URL_PATTERN)) {
                    browserOpened = true;
                    try {
                        await shell.openExternal('https://github.com/login/device');
                        console.log('[GitHub Auth] Browser opened for device flow');
                    }
                    catch (browserError) {
                        console.error('[GitHub Auth] Failed to open browser:', browserError);
                    }
                }
            }
        };
        activeGitHubAuthProcess.stdout?.on('data', (data) => {
            output += data.toString();
            console.log('[GitHub Auth] stdout:', data.toString().trim());
            tryExtractAndOpenBrowser();
        });
        activeGitHubAuthProcess.stderr?.on('data', (data) => {
            output += data.toString();
            console.log('[GitHub Auth] stderr:', data.toString().trim());
            tryExtractAndOpenBrowser();
        });
        activeGitHubAuthProcess.on('close', async (code) => {
            console.log('[GitHub Auth] Process exited with code:', code);
            activeGitHubAuthProcess = null;
            if (code === 0) {
                // Auth successful - get user info
                try {
                    const { execSync } = await import('child_process');
                    const authStatus = execSync(`"${ghPath}" auth status 2>&1`, { encoding: 'utf8', timeout: 5000 });
                    let username = null;
                    const usernameMatch = authStatus.match(/Logged in to github\.com account (\S+)/i)
                        || authStatus.match(/Logged in to github\.com as (\S+)/i)
                        || authStatus.match(/account (\S+) \(/i);
                    if (usernameMatch) {
                        username = usernameMatch[1].replace(/[()]/g, '');
                    }
                    // Get the token for API calls
                    let token = null;
                    try {
                        token = execSync(`"${ghPath}" auth token`, { encoding: 'utf8', timeout: 5000 }).trim();
                    }
                    catch {
                        console.log('[GitHub Auth] Could not get token, will use gh CLI for API calls');
                    }
                    resolve({
                        success: true,
                        username,
                        token,
                    });
                    // Notify renderer of success
                    if (mainWindow) {
                        mainWindow.webContents.send('github-cli:auth-complete', {
                            success: true,
                            username,
                            token,
                        });
                    }
                }
                catch (error) {
                    console.error('[GitHub Auth] Failed to get auth info after login:', error);
                    resolve({
                        success: true,
                        username: null,
                        token: null,
                    });
                }
            }
            else {
                resolve({
                    success: false,
                    error: `Authentication failed (exit code: ${code})`,
                });
                if (mainWindow) {
                    mainWindow.webContents.send('github-cli:auth-complete', {
                        success: false,
                        error: `Authentication failed (exit code: ${code})`,
                    });
                }
            }
        });
        activeGitHubAuthProcess.on('error', (error) => {
            console.error('[GitHub Auth] Process error:', error);
            activeGitHubAuthProcess = null;
            resolve({
                success: false,
                error: error.message,
            });
        });
        // Return initial status while auth is in progress
        setTimeout(() => {
            if (deviceCode) {
                resolve({
                    success: true,
                    pending: true,
                    device_code: deviceCode,
                    verification_uri: 'https://github.com/login/device',
                });
            }
        }, 3000);
    });
});
/**
 * Cancel ongoing GitHub auth
 */
ipcMain.handle('github-cli:cancel-auth', async () => {
    console.log('[IPC] github-cli:cancel-auth called');
    if (activeGitHubAuthProcess) {
        activeGitHubAuthProcess.kill();
        activeGitHubAuthProcess = null;
        return { success: true };
    }
    return { success: true, message: 'No active auth process' };
});
/**
 * Logout from GitHub CLI
 */
ipcMain.handle('github-cli:logout', async () => {
    console.log('[IPC] github-cli:logout called');
    try {
        const ghPath = await getGitHubCLIPath();
        if (!ghPath) {
            return { success: false, error: 'GitHub CLI not found' };
        }
        const { execSync } = await import('child_process');
        execSync(`"${ghPath}" auth logout --hostname github.com`, { encoding: 'utf8', timeout: 10000, input: 'Y\n' });
        return { success: true };
    }
    catch (error) {
        console.error('[GitHub CLI] Logout error:', error);
        // Even if logout fails, it might already be logged out
        return { success: true };
    }
});
/**
 * Get GitHub token from gh CLI (for API calls)
 */
ipcMain.handle('github-cli:get-token', async () => {
    console.log('[IPC] github-cli:get-token called');
    try {
        const ghPath = await getGitHubCLIPath();
        if (!ghPath) {
            return { success: false, error: 'GitHub CLI not found' };
        }
        const { execSync } = await import('child_process');
        const token = execSync(`"${ghPath}" auth token`, { encoding: 'utf8', timeout: 5000 }).trim();
        return { success: true, token };
    }
    catch (error) {
        console.error('[GitHub CLI] Get token error:', error);
        return { success: false, error: 'Not authenticated or token not available' };
    }
});
// ============================================================================
// Custom Protocol Handler
// ============================================================================
// Register custom protocol for OAuth callback (must be before app.whenReady)
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PROTOCOL_NAME, process.execPath, [path.resolve(process.argv[1])]);
    }
}
else {
    app.setAsDefaultProtocolClient(PROTOCOL_NAME);
}
// Handle protocol URL on Windows/Linux (second instance)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}
else {
    app.on('second-instance', (_event, commandLine) => {
        // Someone tried to run a second instance, focus our window and handle protocol
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.focus();
        }
        // Handle protocol URL (Windows/Linux)
        const protocolUrl = commandLine.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`));
        if (protocolUrl) {
            handleProtocolUrl(protocolUrl);
        }
    });
}
// Handle protocol URL on macOS
app.on('open-url', (_event, url) => {
    if (url.startsWith(`${PROTOCOL_NAME}://`)) {
        handleProtocolUrl(url);
    }
});
/**
 * Handle custom protocol URL (autopolio://oauth-callback?...)
 */
function handleProtocolUrl(url) {
    console.log('[Protocol] Received URL:', url);
    try {
        const parsedUrl = new URL(url);
        // Handle OAuth callback: autopolio://oauth-callback?user_id=...&github_connected=...
        if (parsedUrl.hostname === 'oauth-callback' || parsedUrl.pathname.includes('oauth-callback')) {
            const userId = parsedUrl.searchParams.get('user_id');
            const githubConnected = parsedUrl.searchParams.get('github_connected');
            const redirectPath = parsedUrl.searchParams.get('path') || '/setup/github';
            console.log('[Protocol] OAuth callback:', { userId, githubConnected, redirectPath });
            if (mainWindow && userId && githubConnected) {
                // Focus the window
                if (mainWindow.isMinimized())
                    mainWindow.restore();
                mainWindow.focus();
                // Navigate to the redirect path and inject OAuth data
                const targetUrl = isDev
                    ? `http://localhost:5173${redirectPath}?user_id=${userId}&github_connected=${githubConnected}`
                    : `app://-${redirectPath}?user_id=${userId}&github_connected=${githubConnected}`;
                mainWindow.loadURL(targetUrl);
                // Also dispatch event after navigation
                setTimeout(() => {
                    mainWindow?.webContents.executeJavaScript(`
            localStorage.setItem('oauth_callback_user_id', '${userId}');
            localStorage.setItem('oauth_callback_github_connected', '${githubConnected}');
            window.dispatchEvent(new CustomEvent('oauth-callback', {
              detail: { userId: '${userId}', githubConnected: '${githubConnected}' }
            }));
            console.log('[OAuth] Callback received from protocol handler');
          `);
                }, 1000);
            }
        }
    }
    catch (error) {
        console.error('[Protocol] Error handling URL:', error);
    }
}
// ============================================================================
// App Lifecycle
// ============================================================================
app.whenReady().then(async () => {
    console.log('[Main] App is ready, initializing...');
    try {
        await startPythonBackend();
        console.log('[Main] Backend initialization complete');
        createWindow();
        console.log('[Main] Window created');
        // Fire-and-forget: prefetch CLI status in background
        prefetchCLIStatus();
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    }
    catch (error) {
        console.error('[Main] Failed to start app:', error);
        app.quit();
    }
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // Stop all CLI processes
        getAgentProcessManager().stopAll();
        stopPythonBackend();
        app.quit();
    }
});
app.on('before-quit', async () => {
    // Stop all CLI processes before quitting
    await getAgentProcessManager().stopAll();
    stopPythonBackend();
});
// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    await getAgentProcessManager().stopAll();
    stopPythonBackend();
});
