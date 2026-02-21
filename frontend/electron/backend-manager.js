// ============================================================================
// Backend Process Lifecycle Manager
// ============================================================================
import { app } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getPythonEnvManager } from './services/python-env-manager.js';
import { getAugmentedEnv } from './utils/env-utils.js';
// ============================================================================
// Module State
// ============================================================================
let pythonProcess = null;
let backendRestartCount = 0;
let config;
export function initBackendManager(cfg) {
    config = cfg;
}
// ============================================================================
// Health Check
// ============================================================================
export async function waitForBackend() {
    const maxAttempts = 30; // 30 seconds
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await fetch(`${config.backendUrl}/health`);
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
// ============================================================================
// PID File Management
// ============================================================================
export function savePidFile(pid) {
    try {
        const pidFile = config.getPidFilePath();
        fs.writeFileSync(pidFile, String(pid));
        console.log(`[PID] Saved backend PID ${pid} to ${pidFile}`);
    }
    catch (error) {
        console.error('[PID] Failed to save PID file:', error);
    }
}
export function cleanupPidFile() {
    try {
        const pidFile = config.getPidFilePath();
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
// ============================================================================
// Kill Existing Backend
// ============================================================================
export async function killExistingBackend() {
    console.log('[Cleanup] Checking for existing backend processes...');
    // First, clean up via PID file
    cleanupPidFile();
    if (process.platform === 'win32') {
        // Windows: Find and kill only Python processes using backend port
        return new Promise((resolve) => {
            const findProcess = spawn('cmd', ['/c', `netstat -ano | findstr :${config.backendPort}`], { shell: true });
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
                    console.log(`[Cleanup] No processes found using port ${config.backendPort}`);
                    resolve();
                    return;
                }
                console.log(`[Cleanup] Found ${pids.size} process(es) using port ${config.backendPort}:`, Array.from(pids));
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
                                const probe = spawn('cmd', ['/c', `netstat -ano | findstr ":${config.backendPort}" | findstr "LISTENING"`], { shell: true });
                                let probeOutput = '';
                                probe.stdout?.on('data', (d) => { probeOutput += d.toString(); });
                                probe.on('close', () => {
                                    const stillListening = probeOutput.trim().length > 0;
                                    if (!stillListening || attempts >= maxAttempts) {
                                        if (attempts >= maxAttempts) {
                                            console.log(`[Cleanup] Port ${config.backendPort} still in use after ${attempts} attempts, proceeding anyway`);
                                        }
                                        else {
                                            console.log(`[Cleanup] Port ${config.backendPort} freed after ${attempts} attempt(s)`);
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
                        console.log(`[Cleanup] No Python processes on port ${config.backendPort} (Docker/other service may be using it)`);
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
            const findProcess = spawn('lsof', ['-ti', `:${config.backendPort}`], { shell: true });
            let output = '';
            findProcess.stdout?.on('data', (data) => {
                output += data.toString();
            });
            findProcess.on('close', () => {
                const pids = output.trim().split('\n').filter(pid => pid);
                if (pids.length > 0) {
                    console.log(`[Cleanup] Found ${pids.length} process(es) using port ${config.backendPort}`);
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
// ============================================================================
// Start / Stop Backend
// ============================================================================
export function startPythonBackend() {
    return new Promise(async (resolve) => {
        console.log('[Backend] Checking if backend is running...');
        // First, check if backend is already running (before any cleanup)
        const backendRunning = await new Promise((checkResolve) => {
            import('http').then((http) => {
                const req = http.get(`http://127.0.0.1:${config.backendPort}/health`, { timeout: 3000 }, (res) => {
                    console.log('[Backend] Backend responded with status:', res.statusCode);
                    checkResolve(res.statusCode === 200);
                });
                req.on('error', (err) => {
                    console.log('[Backend] Backend check failed:', err.message);
                    checkResolve(false);
                });
                req.on('timeout', () => {
                    console.log('[Backend] Backend check timed out');
                    req.destroy();
                    checkResolve(false);
                });
            }).catch(() => checkResolve(false));
        });
        if (backendRunning) {
            console.log('[Backend] Backend is already running, skipping startup');
            resolve();
            return;
        }
        // Kill any existing zombie processes (only if backend not responding)
        await killExistingBackend();
        // Double-check after cleanup
        try {
            const response = await fetch(`${config.backendUrl}/health`);
            if (response.ok) {
                console.log('[Backend] Backend started externally');
                resolve();
                return;
            }
        }
        catch {
            console.log('[Backend] Backend not detected, attempting to start...');
        }
        // Initialize Python environment manager
        const pythonEnvManager = getPythonEnvManager();
        const envStatus = await pythonEnvManager.initialize();
        if (!envStatus.ready) {
            console.error('[Backend] Python environment not ready:', envStatus.error);
            resolve();
            return;
        }
        console.log('[Backend] Python environment ready:');
        console.log(`  - Python: ${envStatus.pythonPath}`);
        console.log(`  - Site packages: ${envStatus.sitePackagesPath || '(system)'}`);
        console.log(`  - Backend: ${envStatus.backendPath}`);
        console.log(`  - Using bundled: ${envStatus.usingBundled}`);
        // Get Python command and environment
        const { command: pythonCommand } = pythonEnvManager.getPythonCommand();
        const pythonEnv = pythonEnvManager.getPythonEnv();
        const projectRoot = pythonEnvManager.getProjectRoot();
        const userDataPath = config.getConsistentUserDataPath();
        const userDataDbDir = path.join(userDataPath, 'data');
        fs.mkdirSync(userDataDbDir, { recursive: true });
        let additionalEnv = {
            AUTOPOLIO_DATA_DIR: userDataDbDir,
            DATABASE_URL: `sqlite+aiosqlite:///${path.join(userDataDbDir, 'autopolio.db')}`,
        };
        if (app.isPackaged) {
            additionalEnv = {
                ...additionalEnv,
                AUTOPOLIO_BASE_DIR: process.resourcesPath,
                AUTOPOLIO_CONFIG_DIR: path.join(process.resourcesPath, 'config'),
                AUTOPOLIO_PLATFORM_TEMPLATES_DIR: path.join(process.resourcesPath, 'data', 'platform_templates'),
                AUTOPOLIO_TEMPLATES_DIR: path.join(process.resourcesPath, 'data', 'templates'),
            };
        }
        else {
            additionalEnv = {
                ...additionalEnv,
                AUTOPOLIO_CONFIG_DIR: path.join(projectRoot, 'config'),
                AUTOPOLIO_PLATFORM_TEMPLATES_DIR: path.join(projectRoot, 'data', 'platform_templates'),
                AUTOPOLIO_TEMPLATES_DIR: path.join(projectRoot, 'data', 'templates'),
            };
        }
        console.log(`[Backend] Starting backend from: ${projectRoot}`);
        console.log(`[Backend] Using Python: ${pythonCommand}`);
        // Build uvicorn arguments
        const uvicornArgs = [
            '-m', 'uvicorn',
            'api.main:app',
            '--host', '127.0.0.1',
            '--port', String(config.backendPort),
            ...(config.isDev ? ['--reload', '--reload-dir', 'api'] : []),
        ];
        // Use augmented PATH so CLI tools can be found
        const augmentedEnv = getAugmentedEnv();
        pythonProcess = spawn(pythonCommand, uvicornArgs, {
            cwd: projectRoot,
            env: {
                ...augmentedEnv,
                ...pythonEnv,
                ...additionalEnv,
                SECRET_KEY: config.getOrCreateSecretKey(),
            },
            shell: process.platform === 'win32',
        });
        // Save PID for tracking
        if (pythonProcess.pid) {
            savePidFile(pythonProcess.pid);
        }
        let started = false;
        pythonProcess.stdout?.on('data', (data) => {
            const output = data.toString();
            console.log(`[Backend] stdout: ${output}`);
            if (!started && output.includes('Uvicorn running')) {
                started = true;
                backendRestartCount = 0;
                resolve();
            }
        });
        pythonProcess.stderr?.on('data', (data) => {
            const output = data.toString();
            console.log(`[Backend] stderr: ${output}`);
            if (!started && output.includes('Uvicorn running')) {
                started = true;
                backendRestartCount = 0;
                resolve();
            }
        });
        pythonProcess.on('error', (error) => {
            console.error('[Backend] Failed to start backend:', error);
            resolve();
        });
        pythonProcess.on('close', (code) => {
            console.log(`[Backend] Exited with code ${code}`);
            pythonProcess = null;
            // Auto-restart on abnormal exit (code !== 0) - max N attempts
            if (code !== 0 && code !== null && backendRestartCount < config.maxRestarts) {
                backendRestartCount++;
                console.log(`[Backend] Abnormal exit detected. Restarting (attempt ${backendRestartCount}/${config.maxRestarts})...`);
                setTimeout(() => {
                    startPythonBackend().catch((err) => {
                        console.error('[Backend] Restart failed:', err);
                    });
                }, 2000);
            }
            else if (code !== 0 && backendRestartCount >= config.maxRestarts) {
                console.error(`[Backend] Max restart attempts (${config.maxRestarts}) reached. Backend will not be restarted.`);
            }
        });
        // Timeout: resolve anyway after 15 seconds
        setTimeout(() => {
            if (!started) {
                console.log('[Backend] Startup timed out, continuing anyway...');
                resolve();
            }
        }, 15000);
    });
}
export function stopPythonBackend() {
    if (pythonProcess) {
        console.log('Stopping backend...');
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(pythonProcess.pid), '/f', '/t'], {
                shell: true,
            });
        }
        else {
            pythonProcess.kill('SIGTERM');
        }
        pythonProcess = null;
    }
    // Always clean up PID file
    cleanupPidFile();
}
