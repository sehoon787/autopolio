// IPC Handlers - CLI Native Login (Claude Code, Gemini CLI)
import { ipcMain, shell } from 'electron';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getCLIToolManager } from '../services/cli-tool-manager.js';
let activeLoginProcess = null;
let activeLoginTool = null;
// URL pattern for Claude Code login output
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/;
// Login timeout (120s for user browser interaction)
const LOGIN_TIMEOUT_MS = 120_000;
/**
 * Check Claude Code auth status via `claude auth status`
 */
async function checkClaudeAuthStatus(cliPath) {
    return new Promise((resolve) => {
        try {
            const proc = spawn(cliPath, ['auth', 'status'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 10_000,
            });
            // Close stdin immediately to prevent interactive mode (old versions)
            proc.stdin?.end();
            let output = '';
            proc.stdout?.on('data', (data) => { output += data.toString(); });
            proc.stderr?.on('data', (data) => { output += data.toString(); });
            proc.on('close', (code) => {
                const trimmed = output.trim();
                console.log('[CLI Auth] claude auth status output:', trimmed);
                // Try JSON parse first (Claude Code v2.1+ outputs JSON)
                try {
                    const json = JSON.parse(trimmed);
                    if (json.loggedIn) {
                        resolve({
                            authenticated: true,
                            method: 'oauth',
                            email: json.email || undefined,
                        });
                        return;
                    }
                    // JSON parsed but loggedIn is false
                    resolve({ authenticated: false });
                    return;
                }
                catch {
                    // Not JSON, fall through to text matching
                }
                // Fallback: text-based matching
                if (trimmed && (trimmed.includes('Logged in') || trimmed.includes('logged in') || trimmed.includes('✓'))) {
                    const emailMatch = trimmed.match(/(?:email|account|as)\s*[:=]?\s*(\S+@\S+)/i);
                    resolve({
                        authenticated: true,
                        method: 'oauth',
                        email: emailMatch?.[1] || undefined,
                    });
                }
                else {
                    resolve({ authenticated: false });
                }
            });
            proc.on('error', (err) => {
                console.error('[CLI Auth] claude auth status error:', err);
                resolve({ authenticated: false, error: err.message });
            });
        }
        catch (err) {
            resolve({ authenticated: false, error: err instanceof Error ? err.message : String(err) });
        }
    });
}
/**
 * Check Gemini CLI auth status by checking credential files
 */
function checkGeminiAuthStatus() {
    const geminiDir = path.join(os.homedir(), '.gemini');
    const oauthCreds = path.join(geminiDir, 'oauth_creds.json');
    const googleAccounts = path.join(geminiDir, 'google_accounts.json');
    try {
        if (fs.existsSync(oauthCreds)) {
            let account;
            // Try to read account info from google_accounts.json
            if (fs.existsSync(googleAccounts)) {
                try {
                    const data = JSON.parse(fs.readFileSync(googleAccounts, 'utf8'));
                    if (Array.isArray(data) && data.length > 0) {
                        account = data[0].email || data[0].account;
                    }
                    else if (data.active) {
                        account = data.active;
                    }
                    else if (data.email) {
                        account = data.email;
                    }
                }
                catch {
                    // ignore parse errors
                }
            }
            return {
                authenticated: true,
                method: 'oauth',
                account,
            };
        }
    }
    catch {
        // ignore filesystem errors
    }
    return { authenticated: false };
}
/**
 * Get CLI path from CLIToolManager cache
 */
async function getCLIPath(tool) {
    const manager = getCLIToolManager();
    const cliType = tool === 'claude_code' ? 'claude_code' : tool === 'codex_cli' ? 'codex_cli' : 'gemini_cli';
    try {
        const status = await manager.detectCLI(cliType);
        return status.installed ? status.path : null;
    }
    catch {
        return null;
    }
}
export function registerCLIAuthIPC(deps) {
    // ============================================================================
    // cli-auth:status — Quick auth status check (no token consumed)
    // ============================================================================
    ipcMain.handle('cli-auth:status', async (_event, tool) => {
        console.log('[IPC] cli-auth:status called for', tool);
        if (tool === 'codex_cli') {
            const cliPath = await getCLIPath('codex_cli');
            if (!cliPath) {
                return { authenticated: false, error: 'Codex CLI not found' };
            }
            return checkCodexAuthStatus(cliPath);
        }
        if (tool === 'gemini_cli') {
            return checkGeminiAuthStatus();
        }
        if (tool === 'claude_code') {
            const cliPath = await getCLIPath('claude_code');
            if (!cliPath) {
                return { authenticated: false, error: 'Claude Code CLI not found' };
            }
            return checkClaudeAuthStatus(cliPath);
        }
        return { authenticated: false, error: `Unknown tool: ${tool}` };
    });
    // ============================================================================
    // cli-auth:login — Start CLI login process
    // ============================================================================
    ipcMain.handle('cli-auth:login', async (_event, tool) => {
        console.log('[IPC] cli-auth:login called for', tool);
        // Cancel any active login process
        if (activeLoginProcess) {
            activeLoginProcess.kill();
            activeLoginProcess = null;
            activeLoginTool = null;
        }
        const cliPath = await getCLIPath(tool);
        if (!cliPath) {
            return { success: false, tool, error: `${tool} CLI not found` };
        }
        if (tool === 'claude_code') {
            return startClaudeLogin(cliPath, deps);
        }
        if (tool === 'gemini_cli') {
            return startGeminiLogin(cliPath, deps);
        }
        if (tool === 'codex_cli') {
            return startCodexLogin(cliPath, deps);
        }
        return { success: false, tool, error: `Native login not supported for ${tool}` };
    });
    // ============================================================================
    // cli-auth:cancel — Cancel ongoing login
    // ============================================================================
    ipcMain.handle('cli-auth:cancel', async () => {
        console.log('[IPC] cli-auth:cancel called');
        if (activeLoginProcess) {
            activeLoginProcess.kill();
            activeLoginProcess = null;
            activeLoginTool = null;
            return { success: true };
        }
        return { success: true, message: 'No active login process' };
    });
    // ============================================================================
    // cli-auth:logout — CLI logout
    // ============================================================================
    ipcMain.handle('cli-auth:logout', async (_event, tool) => {
        console.log('[IPC] cli-auth:logout called for', tool);
        if (tool === 'claude_code') {
            const claudePath = await getCLIPath('claude_code');
            if (!claudePath) {
                return { success: false, error: 'Claude Code CLI not found' };
            }
            return new Promise((resolve) => {
                const proc = spawn(claudePath, ['auth', 'logout'], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    timeout: 10_000,
                });
                proc.on('close', () => resolve({ success: true }));
                proc.on('error', (err) => resolve({ success: false, error: err.message }));
            });
        }
        if (tool === 'codex_cli') {
            const cliPath = await getCLIPath('codex_cli');
            if (!cliPath) {
                return { success: false, error: 'Codex CLI not found' };
            }
            return new Promise((resolve) => {
                const proc = spawn(cliPath, ['logout'], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    timeout: 10_000,
                });
                proc.on('close', () => resolve({ success: true }));
                proc.on('error', (err) => resolve({ success: false, error: err.message }));
            });
        }
        if (tool === 'gemini_cli') {
            // Remove Gemini credential files
            const geminiDir = path.join(os.homedir(), '.gemini');
            const files = ['oauth_creds.json', 'google_accounts.json'];
            for (const file of files) {
                const filePath = path.join(geminiDir, file);
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                }
                catch (err) {
                    console.error(`[CLI Auth] Failed to remove ${file}:`, err);
                }
            }
            return { success: true };
        }
        return { success: false, error: `Logout not supported for ${tool}` };
    });
}
/**
 * Extract email from a JWT id_token payload (no verification, just decode)
 */
function extractEmailFromJWT(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3)
            return undefined;
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        return payload.email || undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Read Codex auth.json and extract account email
 */
function readCodexAuthFile() {
    const authFile = path.join(os.homedir(), '.codex', 'auth.json');
    try {
        if (fs.existsSync(authFile)) {
            const data = JSON.parse(fs.readFileSync(authFile, 'utf8'));
            if (data.token || data.api_key || data.tokens?.access_token || data.OPENAI_API_KEY) {
                const account = data.email || (data.tokens?.id_token ? extractEmailFromJWT(data.tokens.id_token) : undefined);
                return { authenticated: true, method: data.tokens ? 'oauth' : 'api_key', account };
            }
        }
    }
    catch {
        // ignore
    }
    return { authenticated: false };
}
/**
 * Check Codex CLI auth status via `codex login status`
 * Falls back to checking ~/.codex/auth.json
 */
async function checkCodexAuthStatus(cliPath) {
    return new Promise((resolve) => {
        try {
            const proc = spawn(cliPath, ['login', 'status'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 10_000,
            });
            let output = '';
            proc.stdout?.on('data', (data) => { output += data.toString(); });
            proc.stderr?.on('data', (data) => { output += data.toString(); });
            proc.on('close', (code) => {
                console.log('[CLI Auth] codex login status output:', output.trim(), 'code:', code);
                if (code === 0 || output.includes('Logged in') || output.includes('logged in') || output.includes('✓')) {
                    const emailMatch = output.match(/(?:email|account|as|user)\s*[:=]?\s*(\S+@\S+)/i);
                    // If CLI didn't return email, try reading from auth.json JWT
                    const account = emailMatch?.[1] || readCodexAuthFile().account;
                    resolve({
                        authenticated: true,
                        method: 'oauth',
                        account,
                    });
                }
                else {
                    const fallback = readCodexAuthFile();
                    resolve(fallback.authenticated ? fallback : { authenticated: false });
                }
            });
            proc.on('error', (err) => {
                console.error('[CLI Auth] codex login status error:', err);
                const fallback = readCodexAuthFile();
                resolve(fallback.authenticated ? fallback : { authenticated: false, error: err.message });
            });
        }
        catch (err) {
            resolve({ authenticated: false, error: err instanceof Error ? err.message : String(err) });
        }
    });
}
function startLoginProcess(config) {
    const { tool, cliPath, args, deps, watchForUrl, openUrlInBrowser, verifyAuth, env, stdinData, cleanup } = config;
    return new Promise((resolve) => {
        let output = '';
        let browserOpened = false;
        let resolved = false;
        activeLoginTool = tool;
        activeLoginProcess = spawn(cliPath, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: false,
            ...(env ? { env } : {}),
        });
        // Write initial data to stdin if provided (e.g., "Y\n" for Gemini confirmation)
        if (stdinData && activeLoginProcess.stdin) {
            activeLoginProcess.stdin.write(stdinData);
        }
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                activeLoginProcess?.kill();
                activeLoginProcess = null;
                activeLoginTool = null;
                cleanup?.();
                resolve({ success: false, tool, error: 'Login timed out' });
            }
        }, LOGIN_TIMEOUT_MS);
        const mainWindow = deps.getMainWindow();
        const tryExtractUrl = watchForUrl ? async () => {
            const urlMatch = output.match(URL_PATTERN);
            if (urlMatch && !browserOpened) {
                browserOpened = true;
                const url = urlMatch[0];
                console.log(`[CLI Auth] ${tool} login URL detected:`, url);
                if (openUrlInBrowser) {
                    shell.openExternal(url);
                }
                if (mainWindow) {
                    mainWindow.webContents.send('cli-auth:login-url', { tool, url });
                }
            }
        } : undefined;
        activeLoginProcess.stdout?.on('data', (data) => {
            output += data.toString();
            console.log(`[CLI Auth] ${tool} login stdout:`, data.toString().trim());
            tryExtractUrl?.();
        });
        activeLoginProcess.stderr?.on('data', (data) => {
            output += data.toString();
            console.log(`[CLI Auth] ${tool} login stderr:`, data.toString().trim());
            tryExtractUrl?.();
        });
        activeLoginProcess.on('close', async (code) => {
            clearTimeout(timeout);
            activeLoginProcess = null;
            activeLoginTool = null;
            cleanup?.();
            if (resolved)
                return;
            resolved = true;
            console.log(`[CLI Auth] ${tool} login exited with code:`, code);
            const authStatus = await verifyAuth(cliPath);
            const result = {
                success: authStatus.authenticated,
                tool,
                email: authStatus.email,
                account: authStatus.account,
                error: authStatus.authenticated ? undefined : 'Login was not completed',
            };
            const currentMainWindow = deps.getMainWindow();
            if (currentMainWindow) {
                currentMainWindow.webContents.send('cli-auth:login-complete', result);
            }
            resolve(result);
        });
        activeLoginProcess.on('error', (err) => {
            clearTimeout(timeout);
            activeLoginProcess = null;
            activeLoginTool = null;
            cleanup?.();
            if (resolved)
                return;
            resolved = true;
            console.error(`[CLI Auth] ${tool} login error:`, err);
            resolve({ success: false, tool, error: err.message });
        });
    });
}
function startClaudeLogin(cliPath, deps) {
    return startLoginProcess({
        tool: 'claude_code', cliPath, args: ['auth', 'login'], deps,
        watchForUrl: true, verifyAuth: checkClaudeAuthStatus,
    });
}
function startGeminiLogin(cliPath, deps) {
    // Delete existing oauth creds to force re-auth
    const oauthCreds = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
    try {
        if (fs.existsSync(oauthCreds)) {
            fs.unlinkSync(oauthCreds);
            console.log('[CLI Auth] Deleted existing Gemini oauth_creds.json for re-auth');
        }
    }
    catch { /* ignore */ }
    // Create interceptor dir to capture OAuth URL from `open`/`xdg-open`
    const interceptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini_intercept_'));
    const urlFile = path.join(interceptDir, 'captured_url');
    // Create interceptor scripts
    const browserCmds = process.platform === 'win32'
        ? ['start']
        : ['open', 'xdg-open', 'sensible-browser', 'x-www-browser'];
    for (const cmd of browserCmds) {
        const scriptPath = path.join(interceptDir, cmd);
        fs.writeFileSync(scriptPath, `#!/bin/sh\necho "$1" > "${urlFile}"\n`, { mode: 0o755 });
    }
    // Build env with interceptor prepended to PATH and API keys stripped
    const cleanEnv = { ...process.env };
    delete cleanEnv.GEMINI_API_KEY;
    delete cleanEnv.GEMINI_CLI_API_KEY;
    cleanEnv.PATH = interceptDir + path.delimiter + (cleanEnv.PATH || '');
    // Poll for captured URL and send to frontend
    const pollForUrl = () => {
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (attempts > 25) { // 5 seconds max
                clearInterval(interval);
                return;
            }
            try {
                if (fs.existsSync(urlFile)) {
                    const url = fs.readFileSync(urlFile, 'utf-8').trim();
                    if (url) {
                        clearInterval(interval);
                        console.log('[CLI Auth] Gemini OAuth URL captured:', url.substring(0, 80));
                        // Open browser immediately
                        shell.openExternal(url);
                        const mainWindow = deps.getMainWindow();
                        if (mainWindow) {
                            mainWindow.webContents.send('cli-auth:login-url', { tool: 'gemini_cli', url });
                        }
                    }
                }
            }
            catch { /* ignore */ }
        }, 200);
    };
    pollForUrl();
    return startLoginProcess({
        tool: 'gemini_cli', cliPath, args: ['-p', 'Reply OK'], deps,
        watchForUrl: false, // URL is captured via interceptor, not stdout
        verifyAuth: () => checkGeminiAuthStatus(),
        env: cleanEnv,
        stdinData: 'Y\n',
        cleanup: () => {
            try {
                fs.rmSync(interceptDir, { recursive: true, force: true });
            }
            catch { /* ignore */ }
        },
    });
}
function startCodexLogin(cliPath, deps) {
    return startLoginProcess({
        tool: 'codex_cli', cliPath, args: ['login'], deps,
        watchForUrl: true, openUrlInBrowser: true,
        verifyAuth: checkCodexAuthStatus,
    });
}
