// ============================================================================
// IPC Handlers - CLI Detection (Claude Code / Gemini CLI)
// ============================================================================
import { ipcMain } from 'electron';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getCLIToolManager } from '../services/cli-tool-manager.js';
let cachedCLIStatus = { claude: null, gemini: null };
// Promise that resolves when prefetch completes (or times out).
// IPC handlers await this before falling back to slow detection.
let _prefetchResolve;
const _prefetchReady = new Promise(resolve => { _prefetchResolve = resolve; });
const _prefetchWithTimeout = Promise.race([
    _prefetchReady,
    new Promise(resolve => setTimeout(resolve, 15000)), // 15s safety timeout
]);
/**
 * Get the current cached CLI status (used by main.ts for prefetch).
 */
export function getCachedCLIStatus() {
    return cachedCLIStatus;
}
/**
 * Update the cached CLI status (used by main.ts after prefetch).
 * Also signals that prefetch is complete so IPC handlers can use cached data.
 */
export function setCachedCLIStatus(status) {
    cachedCLIStatus = status;
    if (_prefetchResolve) {
        _prefetchResolve();
        _prefetchResolve = null;
    }
}
// ============================================================================
// Registration
// ============================================================================
export function registerCLIDetectionIPC() {
    // --------------------------------------------------------------------------
    // Claude Code CLI Status
    // --------------------------------------------------------------------------
    ipcMain.handle('get-claude-cli-status', async () => {
        console.log('[IPC] get-claude-cli-status called');
        try {
            // Wait for prefetch to finish (or timeout) before checking cache
            await _prefetchWithTimeout;
            if (cachedCLIStatus.claude) {
                console.log('[IPC] get-claude-cli-status returning cached result');
                return cachedCLIStatus.claude;
            }
            // Platform-specific fast-path detection
            let claudePath = null;
            const homeDir = os.homedir();
            if (process.platform === 'win32') {
                const windowsPaths = [
                    path.join(homeDir, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
                    path.join(homeDir, 'AppData', 'Local', 'npm', 'claude.cmd'),
                ];
                for (const p of windowsPaths) {
                    if (fs.existsSync(p)) {
                        claudePath = p;
                        console.log(`[IPC] Claude found at Windows path: ${p}`);
                        break;
                    }
                }
            }
            else if (process.platform === 'darwin') {
                const macosPaths = [
                    path.join(homeDir, '.local', 'bin', 'claude'),
                    path.join(homeDir, '.claude', 'local', 'bin', 'claude'),
                    '/opt/homebrew/bin/claude',
                    '/usr/local/bin/claude',
                    path.join(homeDir, '.npm-global', 'bin', 'claude'),
                ];
                for (const p of macosPaths) {
                    if (fs.existsSync(p)) {
                        claudePath = p;
                        console.log(`[IPC] Claude found at macOS path: ${p}`);
                        break;
                    }
                }
            }
            else {
                const linuxPaths = [
                    path.join(homeDir, '.local', 'bin', 'claude'),
                    '/usr/local/bin/claude',
                    '/usr/bin/claude',
                ];
                for (const p of linuxPaths) {
                    if (fs.existsSync(p)) {
                        claudePath = p;
                        console.log(`[IPC] Claude found at Linux path: ${p}`);
                        break;
                    }
                }
            }
            // If found via fast-path, create status directly
            if (claudePath) {
                console.log('[IPC] Using fast-path detection for Claude CLI');
                const status = {
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
                };
                try {
                    const versionOutput = execSync(`"${claudePath}" --version`, { encoding: 'utf8', timeout: 5000 }).trim();
                    const versionMatch = versionOutput.match(/^([\d.]+)/);
                    status.version = versionMatch ? versionMatch[1] : versionOutput.split(' ')[0];
                    console.log(`[IPC] Claude version: ${status.version}`);
                }
                catch (e) {
                    console.log(`[IPC] Could not get version: ${e instanceof Error ? e.message : e}`);
                }
                cachedCLIStatus.claude = status;
                return status;
            }
            // Fallback to full CLIToolManager detection
            console.log('[IPC] Fast-path not found, using CLIToolManager...');
            const manager = getCLIToolManager();
            const result = await manager.detectCLI('claude_code');
            cachedCLIStatus.claude = result;
            console.log('[IPC] get-claude-cli-status result:', JSON.stringify(result, null, 2));
            return result;
        }
        catch (error) {
            console.error('[IPC] get-claude-cli-status CRITICAL error:', error);
            console.error('[IPC] Error stack:', error instanceof Error ? error.stack : 'No stack');
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
                _error: error instanceof Error ? error.message : String(error),
            };
        }
    });
    // --------------------------------------------------------------------------
    // Gemini CLI Status
    // --------------------------------------------------------------------------
    ipcMain.handle('get-gemini-cli-status', async () => {
        console.log('[IPC] get-gemini-cli-status called');
        try {
            // Wait for prefetch to finish (or timeout) before checking cache
            await _prefetchWithTimeout;
            if (cachedCLIStatus.gemini) {
                console.log('[IPC] get-gemini-cli-status returning cached result');
                return cachedCLIStatus.gemini;
            }
            let geminiPath = null;
            const homeDir = os.homedir();
            if (process.platform === 'win32') {
                const windowsPaths = [
                    path.join(homeDir, 'AppData', 'Roaming', 'npm', 'gemini.cmd'),
                    path.join(homeDir, 'AppData', 'Local', 'npm', 'gemini.cmd'),
                ];
                for (const p of windowsPaths) {
                    if (fs.existsSync(p)) {
                        geminiPath = p;
                        console.log(`[IPC] Gemini found at Windows path: ${p}`);
                        break;
                    }
                }
            }
            else if (process.platform === 'darwin') {
                const macosPaths = [
                    '/opt/homebrew/bin/gemini',
                    '/usr/local/bin/gemini',
                    path.join(homeDir, '.local', 'bin', 'gemini'),
                    path.join(homeDir, '.npm-global', 'bin', 'gemini'),
                ];
                for (const p of macosPaths) {
                    if (fs.existsSync(p)) {
                        geminiPath = p;
                        console.log(`[IPC] Gemini found at macOS path: ${p}`);
                        break;
                    }
                }
            }
            else {
                const linuxPaths = [
                    path.join(homeDir, '.local', 'bin', 'gemini'),
                    '/usr/local/bin/gemini',
                    '/usr/bin/gemini',
                ];
                for (const p of linuxPaths) {
                    if (fs.existsSync(p)) {
                        geminiPath = p;
                        console.log(`[IPC] Gemini found at Linux path: ${p}`);
                        break;
                    }
                }
            }
            if (geminiPath) {
                console.log('[IPC] Using fast-path detection for Gemini CLI');
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
                try {
                    const versionOutput = execSync(`"${geminiPath}" --version`, { encoding: 'utf8', timeout: 5000 }).trim();
                    status.version = versionOutput.split(' ')[0] || versionOutput;
                    console.log(`[IPC] Gemini version: ${status.version}`);
                }
                catch (e) {
                    console.log(`[IPC] Could not get version: ${e instanceof Error ? e.message : e}`);
                }
                cachedCLIStatus.gemini = status;
                return status;
            }
            console.log('[IPC] Fast-path not found, using CLIToolManager...');
            const manager = getCLIToolManager();
            const result = await manager.detectCLI('gemini_cli');
            cachedCLIStatus.gemini = result;
            console.log('[IPC] get-gemini-cli-status result:', JSON.stringify(result, null, 2));
            return result;
        }
        catch (error) {
            console.error('[IPC] get-gemini-cli-status CRITICAL error:', error);
            console.error('[IPC] Error stack:', error instanceof Error ? error.stack : 'No stack');
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
                _error: error instanceof Error ? error.message : String(error),
            };
        }
    });
    // --------------------------------------------------------------------------
    // Refresh All CLI Status
    // --------------------------------------------------------------------------
    ipcMain.handle('refresh-cli-status', async () => {
        console.log('[IPC] refresh-cli-status called');
        try {
            cachedCLIStatus = { claude: null, gemini: null };
            const manager = getCLIToolManager();
            const result = await manager.refreshAll();
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
    // --------------------------------------------------------------------------
    // Refresh Single CLI Status
    // --------------------------------------------------------------------------
    ipcMain.handle('refresh-single-cli-status', async (_, tool) => {
        console.log(`[IPC] refresh-single-cli-status called for ${tool}`);
        try {
            const manager = getCLIToolManager();
            const result = await manager.refreshCLI(tool);
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
    // --------------------------------------------------------------------------
    // CLI Test
    // --------------------------------------------------------------------------
    ipcMain.handle('cli:test', async (_, tool, model) => {
        console.log(`[IPC] cli:test called for ${tool}, model: ${model}`);
        const manager = getCLIToolManager();
        return manager.testCLI(tool, model);
    });
}
