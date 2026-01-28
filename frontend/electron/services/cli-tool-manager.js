/**
 * CLI Tool Manager - Centralized CLI detection and management
 *
 * Auto-Claude style implementation for Autopolio
 * Handles CLI detection, version checking, and testing
 *
 * Key improvements over basic implementation:
 * - PATH augmentation for GUI-launched Electron apps
 * - NVM support for Node version managers
 * - Homebrew priority on macOS
 * - Improved Windows .cmd handling
 * - Detailed debug logging
 */
import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { isWindows, isMacOS, STATUS_CACHE_TTL, VERSION_CACHE_TTL, COMMAND_TIMEOUT, NETWORK_TIMEOUT, CLI_DEBUG, } from '../types/cli.js';
import { getAugmentedEnv, getNvmBinPaths } from '../utils/env-utils.js';
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
// Re-export CLI_CONFIGS for convenience
export { CLI_CONFIGS } from '../types/cli.js';
// Debug logger
function debugLog(message, ...args) {
    if (CLI_DEBUG) {
        console.log(`[CLIToolManager] ${message}`, ...args);
    }
}
/**
 * CLIToolManager - Singleton class for CLI detection and management
 */
export class CLIToolManager {
    static instance;
    // Session-based caching for CLI status
    statusCache = new Map();
    // Longer-lived cache for npm registry versions
    versionCache = new Map();
    constructor() { }
    static getInstance() {
        if (!CLIToolManager.instance) {
            CLIToolManager.instance = new CLIToolManager();
        }
        return CLIToolManager.instance;
    }
    // ============================================================================
    // Public API
    // ============================================================================
    /**
     * Detect CLI status (with caching)
     */
    async detectCLI(tool) {
        // Check cache first
        const cached = this.statusCache.get(tool);
        if (cached && Date.now() - cached.timestamp < STATUS_CACHE_TTL) {
            debugLog(`Using cached status for ${tool}`);
            return cached.status;
        }
        // Perform fresh detection
        const status = await this.performDetection(tool);
        // Update cache
        this.statusCache.set(tool, { status, timestamp: Date.now() });
        return status;
    }
    /**
     * Force refresh CLI status (bypasses cache)
     */
    async refreshCLI(tool) {
        // Clear cache for this tool
        this.statusCache.delete(tool);
        return this.detectCLI(tool);
    }
    /**
     * Refresh all CLI statuses
     */
    async refreshAll() {
        const claude = await this.refreshCLI('claude_code');
        const gemini = await this.refreshCLI('gemini_cli');
        return {
            claude_code: claude,
            gemini_cli: gemini,
        };
    }
    /**
     * Test CLI by running a simple command
     */
    async testCLI(tool, model) {
        debugLog(`Testing ${tool}... model: ${model}`);
        // First, ensure we have the current status
        const status = await this.detectCLI(tool);
        if (!status.installed || !status.path) {
            return {
                success: false,
                tool,
                message: `${this.getConfig(tool).name} is not installed`,
                error: {
                    type: 'not_installed',
                    message: 'CLI is not installed. Please install it first.',
                },
            };
        }
        try {
            // Send a real prompt to test the CLI works end-to-end (like API provider test)
            const testPrompt = "Say hello and confirm you are working.";
            const args = ['-p', testPrompt, '--output-format', 'json'];
            if (model) {
                args.push('--model', model);
            }
            const CLI_TEST_TIMEOUT = 60_000; // 60s for LLM response
            const result = await this.executeCLI(status.path, args, CLI_TEST_TIMEOUT);
            const rawOutput = result.stdout.trim();
            // Parse JSON output for content and tokens
            const { content, tokens } = this.parseTestOutput(rawOutput, tool);
            debugLog(`CLI test output: ${content.substring(0, 200)}`);
            debugLog(`CLI test tokens: ${tokens}`);
            return {
                success: true,
                tool,
                message: content || `${this.getConfig(tool).name} is working correctly`,
                version: status.version || undefined,
                path: status.path,
                output: content,
                tokens,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            debugLog(`Test failed for ${tool}:`, errorMessage);
            return {
                success: false,
                tool,
                message: `Failed to run ${this.getConfig(tool).name}`,
                path: status.path,
                error: this.classifyError(errorMessage),
            };
        }
    }
    /**
     * Parse JSON output from CLI test to extract content and token count.
     */
    parseTestOutput(raw, tool) {
        try {
            const data = JSON.parse(raw);
            if (typeof data !== 'object' || data === null) {
                return { content: raw, tokens: 0 };
            }
            if (tool === 'claude_code' && 'result' in data) {
                const content = typeof data.result === 'string' ? data.result : String(data.result);
                const usage = data.usage || {};
                const tokens = (usage.input_tokens || 0) + (usage.output_tokens || 0)
                    + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
                return { content, tokens };
            }
            if (tool === 'gemini_cli' && 'response' in data) {
                const content = typeof data.response === 'string' ? data.response : String(data.response);
                const models = data.stats?.models || {};
                let tokens = 0;
                for (const modelData of Object.values(models)) {
                    tokens += modelData.tokens?.total || 0;
                }
                return { content, tokens };
            }
            return { content: raw, tokens: 0 };
        }
        catch {
            return { content: raw, tokens: 0 };
        }
    }
    /**
     * Clear all caches
     */
    clearCache() {
        this.statusCache.clear();
        this.versionCache.clear();
        debugLog('All caches cleared');
    }
    // ============================================================================
    // Detection Logic
    // ============================================================================
    async performDetection(tool) {
        const config = this.getConfig(tool);
        debugLog(`Detecting ${config.name}...`);
        const status = {
            tool,
            installed: false,
            version: null,
            latest_version: null,
            is_outdated: false,
            path: null,
            install_command: this.getInstallCommand(tool),
            update_command: this.getUpdateCommand(tool),
            platform: process.platform,
        };
        let foundPath = null;
        // Helper to safely run detection step with timeout
        const safeDetect = async (name, fn) => {
            try {
                debugLog(`Checking ${name}...`);
                const timeoutPromise = new Promise((resolve) => setTimeout(() => {
                    debugLog(`${name} timed out`);
                    resolve(null);
                }, 5000) // 5 second timeout per step
                );
                const result = await Promise.race([fn(), timeoutPromise]);
                if (result) {
                    debugLog(`Found in ${name}: ${result}`);
                }
                return result;
            }
            catch (error) {
                debugLog(`Error in ${name}:`, error);
                return null;
            }
        };
        // Detection order (by priority):
        // 1. Homebrew first on macOS (most common installation method)
        if (isMacOS && !foundPath) {
            foundPath = await safeDetect('Homebrew', () => this.findInHomebrew(config.executable));
        }
        // 2. System PATH with augmented environment
        if (!foundPath) {
            foundPath = await safeDetect('system PATH', () => this.findInSystemPath(config.executable));
        }
        // 3. npm global directory
        if (!foundPath) {
            foundPath = await safeDetect('npm global', () => this.findInNpmGlobal(config.executable));
        }
        // 4. NVM paths (Unix only, sorted by version - newest first)
        if (!foundPath && !isWindows) {
            foundPath = await safeDetect('NVM', () => this.findInNvm(config.executable));
        }
        // 5. Known installation paths (fallback)
        if (!foundPath) {
            foundPath = await safeDetect('known paths', () => this.findInKnownPaths(tool));
        }
        // 6. PowerShell Get-Command fallback (Windows only)
        if (!foundPath && isWindows) {
            foundPath = await safeDetect('PowerShell', () => this.findViaPowerShell(config.executable));
        }
        // Validate found path and get version
        if (foundPath) {
            debugLog(`Found ${config.name} at: ${foundPath}`);
            try {
                const validation = await Promise.race([
                    this.validateCLI(foundPath),
                    new Promise((resolve) => setTimeout(() => resolve({ valid: false, version: null, error: 'Validation timed out' }), 10000)),
                ]);
                if (validation.valid) {
                    status.installed = true;
                    status.path = foundPath;
                    status.version = validation.version;
                    debugLog(`Validated: ${config.name} v${validation.version}`);
                }
                else {
                    debugLog(`Validation failed: ${validation.error}`);
                }
            }
            catch (error) {
                debugLog(`Validation error: ${error}`);
            }
        }
        else {
            debugLog(`${config.name} not found in any location`);
        }
        // Fetch latest version from npm registry (non-blocking)
        try {
            const versionPromise = this.fetchLatestVersion(tool);
            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve('unknown'), 5000));
            status.latest_version = await Promise.race([versionPromise, timeoutPromise]);
            if (status.version && status.latest_version && status.latest_version !== 'unknown') {
                status.is_outdated = this.compareVersions(status.version, status.latest_version);
            }
        }
        catch (error) {
            debugLog(`Failed to fetch latest version for ${tool}:`, error);
            status.latest_version = 'unknown';
        }
        debugLog(`Detection complete for ${config.name}:`, {
            installed: status.installed,
            version: status.version,
            path: status.path,
        });
        return status;
    }
    // ============================================================================
    // Path Finding
    // ============================================================================
    /**
     * Find in Homebrew paths (macOS only)
     */
    async findInHomebrew(executable) {
        if (!isMacOS)
            return null;
        const homebrewPaths = [
            `/opt/homebrew/bin/${executable}`, // Apple Silicon
            `/usr/local/bin/${executable}`, // Intel
        ];
        for (const brewPath of homebrewPaths) {
            if (fs.existsSync(brewPath)) {
                debugLog(`Found in Homebrew: ${brewPath}`);
                return brewPath;
            }
        }
        return null;
    }
    /**
     * Find executable in system PATH using where/which with augmented environment
     */
    async findInSystemPath(executable) {
        const augmentedEnv = getAugmentedEnv();
        debugLog(`Searching for ${executable} in system PATH...`);
        debugLog(`Current PATH (first 500 chars): ${(augmentedEnv.PATH || '').substring(0, 500)}...`);
        try {
            if (isWindows) {
                // Try 'where' command with augmented PATH
                // shell: true is required on Windows to properly resolve where.exe
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { stdout } = await execAsync(`where ${executable}`, {
                    timeout: COMMAND_TIMEOUT,
                    env: augmentedEnv,
                    encoding: 'utf8',
                    shell: true, // Required for Windows to properly resolve commands
                });
                // Parse results - prefer .cmd or .exe over other matches
                const paths = stdout.trim().split('\n').map((p) => p.trim()).filter(Boolean);
                if (paths.length === 0) {
                    return null;
                }
                // Prefer .cmd (npm scripts) or .exe (native executables)
                const preferred = paths.find((p) => p.toLowerCase().endsWith('.cmd') || p.toLowerCase().endsWith('.exe')) || paths[0];
                if (preferred && fs.existsSync(preferred)) {
                    debugLog(`Found via 'where': ${preferred}`);
                    return preferred;
                }
            }
            else {
                // Unix: use 'which' with augmented PATH
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { stdout } = await execAsync(`which ${executable}`, {
                    timeout: COMMAND_TIMEOUT,
                    env: augmentedEnv,
                    encoding: 'utf8',
                    shell: true, // Use shell to ensure proper PATH resolution
                });
                const foundPath = stdout.trim();
                if (foundPath && fs.existsSync(foundPath)) {
                    debugLog(`Found via 'which': ${foundPath}`);
                    return foundPath;
                }
            }
        }
        catch (error) {
            // Log the actual error for debugging
            const errMsg = error instanceof Error ? error.message : String(error);
            debugLog(`Not found in PATH via where/which: ${errMsg}`);
        }
        return null;
    }
    /**
     * Find executable in npm global directory
     */
    async findInNpmGlobal(executable) {
        const augmentedEnv = getAugmentedEnv();
        // 1. Try npm root -g to get npm global modules path
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { stdout } = await execAsync('npm root -g', {
                timeout: COMMAND_TIMEOUT,
                env: augmentedEnv,
                encoding: 'utf8',
                shell: true, // Required for proper npm resolution
            });
            const npmModules = stdout.trim();
            debugLog(`npm root -g returned: ${npmModules}`);
            if (npmModules) {
                const parent = path.dirname(npmModules);
                let cliPath;
                if (isWindows) {
                    // On Windows, check for .cmd file first (npm creates these for global packages)
                    cliPath = path.join(parent, `${executable}.cmd`);
                    if (!fs.existsSync(cliPath)) {
                        // Also check without extension or .exe
                        cliPath = path.join(parent, `${executable}.exe`);
                        if (!fs.existsSync(cliPath)) {
                            cliPath = path.join(parent, executable);
                        }
                    }
                }
                else {
                    cliPath = path.join(parent, 'bin', executable);
                }
                if (fs.existsSync(cliPath)) {
                    debugLog(`Found in npm global: ${cliPath}`);
                    return cliPath;
                }
            }
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            debugLog(`npm root -g failed: ${errMsg}`);
        }
        // 2. Fallback: Check common npm global paths directly
        debugLog('Trying npm global fallback paths...');
        const fallbackPaths = isWindows
            ? [
                path.join(os.homedir(), 'AppData', 'Roaming', 'npm', `${executable}.cmd`),
                path.join(os.homedir(), 'AppData', 'Local', 'npm', `${executable}.cmd`),
                path.join(process.env.APPDATA || '', 'npm', `${executable}.cmd`),
                path.join(os.homedir(), 'AppData', 'Roaming', 'npm', `${executable}.exe`),
                path.join(os.homedir(), 'AppData', 'Roaming', 'npm', executable),
            ]
            : [
                path.join(os.homedir(), '.npm-global', 'bin', executable),
                '/usr/local/lib/node_modules/.bin/' + executable,
                '/usr/local/bin/' + executable,
            ];
        for (const fallbackPath of fallbackPaths) {
            debugLog(`Checking npm fallback path: ${fallbackPath}`);
            if (fallbackPath && fs.existsSync(fallbackPath)) {
                debugLog(`Found in npm fallback: ${fallbackPath}`);
                return fallbackPath;
            }
        }
        return null;
    }
    /**
     * Find in NVM paths (Unix only)
     * Searches through all installed Node versions, newest first
     */
    async findInNvm(executable) {
        if (isWindows) {
            // NVM for Windows has different structure, handled in known paths
            return null;
        }
        const nvmBinPaths = getNvmBinPaths();
        for (const binPath of nvmBinPaths) {
            const cliPath = path.join(binPath, executable);
            if (fs.existsSync(cliPath)) {
                debugLog(`Found in NVM: ${cliPath}`);
                return cliPath;
            }
        }
        return null;
    }
    /**
     * Find in known installation paths
     */
    async findInKnownPaths(tool) {
        const paths = this.getDetectionPaths(tool);
        for (const candidatePath of paths) {
            if (fs.existsSync(candidatePath)) {
                debugLog(`Found in known path: ${candidatePath}`);
                return candidatePath;
            }
        }
        return null;
    }
    /**
     * Find via PowerShell Get-Command (Windows fallback)
     */
    async findViaPowerShell(executable) {
        if (!isWindows)
            return null;
        debugLog(`Trying PowerShell Get-Command for ${executable}...`);
        try {
            // Use PowerShell to find the command
            const psCommand = `Get-Command ${executable} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source`;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { stdout } = await execAsync(`powershell -NoProfile -Command "${psCommand}"`, {
                timeout: COMMAND_TIMEOUT,
                env: getAugmentedEnv(),
                encoding: 'utf8',
                shell: true, // Ensure proper shell context
            });
            const foundPath = stdout.trim();
            if (foundPath && fs.existsSync(foundPath)) {
                debugLog(`Found via PowerShell: ${foundPath}`);
                return foundPath;
            }
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            debugLog(`PowerShell Get-Command failed: ${errMsg}`);
        }
        return null;
    }
    /**
     * Get platform-specific detection paths
     */
    getDetectionPaths(tool) {
        const homeDir = os.homedir();
        const config = this.getConfig(tool);
        const exe = config.executable;
        if (isWindows) {
            return [
                // npm global paths (most common)
                path.join(homeDir, 'AppData', 'Roaming', 'npm', `${exe}.cmd`),
                path.join(homeDir, 'AppData', 'Local', 'npm', `${exe}.cmd`),
                // npm without extension
                path.join(homeDir, 'AppData', 'Roaming', 'npm', exe),
                path.join(homeDir, 'AppData', 'Local', 'npm', exe),
                // Local bin with .exe
                path.join(homeDir, '.local', 'bin', `${exe}.exe`),
                path.join(homeDir, '.local', 'bin', exe),
                // Scoop
                path.join(homeDir, 'scoop', 'shims', `${exe}.cmd`),
                path.join(homeDir, 'scoop', 'shims', exe),
                // Program Files (Claude-specific)
                ...(tool === 'claude_code'
                    ? [
                        path.join(homeDir, 'AppData', 'Local', 'Programs', 'claude', 'claude.exe'),
                        'C:\\Program Files\\Claude\\claude.exe',
                        'C:\\Program Files (x86)\\Claude\\claude.exe',
                    ]
                    : []),
            ];
        }
        else if (isMacOS) {
            return [
                // Homebrew paths (already checked, but keep as fallback)
                `/opt/homebrew/bin/${exe}`,
                `/usr/local/bin/${exe}`,
                // User local paths
                path.join(homeDir, '.local', 'bin', exe),
                path.join(homeDir, '.npm-global', 'bin', exe),
                path.join(homeDir, 'bin', exe),
                // MacPorts
                `/opt/local/bin/${exe}`,
            ];
        }
        else {
            // Linux
            return [
                // Standard paths
                `/usr/local/bin/${exe}`,
                `/usr/bin/${exe}`,
                // User local paths
                path.join(homeDir, '.local', 'bin', exe),
                path.join(homeDir, '.npm-global', 'bin', exe),
                path.join(homeDir, 'bin', exe),
                // Snap
                `/snap/bin/${exe}`,
            ];
        }
    }
    // ============================================================================
    // CLI Execution
    // ============================================================================
    /**
     * Execute CLI command with proper handling for .cmd/.bat files
     */
    async executeCLI(cliPath, args, timeout = COMMAND_TIMEOUT) {
        const augmentedEnv = getAugmentedEnv([path.dirname(cliPath)]);
        const isCmdFile = isWindows &&
            (cliPath.toLowerCase().endsWith('.cmd') || cliPath.toLowerCase().endsWith('.bat'));
        debugLog(`Executing CLI: ${cliPath} with args: ${args.join(' ')}`);
        if (isCmdFile) {
            // Windows .cmd/.bat: build a single shell command string with manually
            // quoted args, then run via spawn(shell:true, stdio:['ignore',...]).
            // - exec() hangs because CLI tools wait for stdin when no TTY is attached.
            // - spawn(cliPath, argsArray, {shell:true}) joins args with spaces,
            //   splitting space-containing prompts into separate words.
            // - Using a pre-quoted command string + stdio:['ignore'] solves both.
            const escapedArgs = args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ');
            const command = `"${cliPath}" ${escapedArgs}`;
            debugLog(`Executing via spawn shell: ${command}`);
            return new Promise((resolve, reject) => {
                const child = spawn(command, {
                    shell: true,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    timeout,
                    env: augmentedEnv,
                    windowsHide: true,
                });
                let stdout = '';
                let stderr = '';
                child.stdout.on('data', (data) => { stdout += data.toString(); });
                child.stderr.on('data', (data) => { stderr += data.toString(); });
                child.on('close', (code) => {
                    if (code === 0)
                        resolve({ stdout, stderr });
                    else
                        reject(new Error(`Command failed (exit ${code}): ${command}\n${stderr}`));
                });
                child.on('error', reject);
            });
        }
        return execFileAsync(cliPath, args, {
            timeout,
            env: augmentedEnv,
        });
    }
    /**
     * Validate CLI and get version
     */
    async validateCLI(cliPath) {
        try {
            const { stdout } = await this.executeCLI(cliPath, ['--version']);
            const version = this.extractVersion(stdout);
            return { valid: true, version };
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            debugLog(`Validation failed for ${cliPath}: ${errMsg}`);
            return {
                valid: false,
                version: null,
                error: errMsg,
            };
        }
    }
    // ============================================================================
    // Version Management
    // ============================================================================
    /**
     * Fetch latest version from npm registry (with caching)
     */
    async fetchLatestVersion(tool) {
        // Check cache first
        const cached = this.versionCache.get(tool);
        if (cached && Date.now() - cached.timestamp < VERSION_CACHE_TTL) {
            return cached.version;
        }
        const config = this.getConfig(tool);
        const url = `https://registry.npmjs.org/${config.npmPackage}/latest`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT);
        try {
            const response = await fetch(url, {
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = (await response.json());
            if (data.version) {
                // Update cache
                this.versionCache.set(tool, { version: data.version, timestamp: Date.now() });
                return data.version;
            }
            throw new Error('No version found in response');
        }
        catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
    /**
     * Extract version number from CLI output
     */
    extractVersion(output) {
        // Try to match semantic version pattern
        const match = output.match(/(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/);
        if (match) {
            return match[1];
        }
        // Fallback: return first line
        return output.split('\n')[0]?.trim() || null;
    }
    /**
     * Compare versions: returns true if current < latest
     */
    compareVersions(current, latest) {
        try {
            const parse = (v) => {
                const match = v.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?/);
                if (!match)
                    return null;
                return {
                    major: parseInt(match[1]),
                    minor: parseInt(match[2]),
                    patch: parseInt(match[3]),
                    prerelease: match[4] || null,
                };
            };
            const curr = parse(current);
            const lat = parse(latest);
            if (!curr || !lat) {
                // Fallback to simple string comparison
                return current !== latest;
            }
            // Compare major.minor.patch
            if (curr.major !== lat.major)
                return curr.major < lat.major;
            if (curr.minor !== lat.minor)
                return curr.minor < lat.minor;
            if (curr.patch !== lat.patch)
                return curr.patch < lat.patch;
            // If same version, prerelease is considered older than release
            if (curr.prerelease && !lat.prerelease)
                return true;
            if (!curr.prerelease && lat.prerelease)
                return false;
            return false;
        }
        catch {
            return false;
        }
    }
    // ============================================================================
    // Error Classification
    // ============================================================================
    /**
     * Classify error message into error type
     */
    classifyError(message) {
        const lowerMessage = message.toLowerCase();
        // Rate limit
        if (/rate.?limit|too many requests|429/i.test(message)) {
            const retryMatch = message.match(/retry.?after:?\s*(\d+)/i);
            return {
                type: 'rate_limit',
                message: 'Rate limit exceeded. Please try again later.',
                retryAfter: retryMatch ? parseInt(retryMatch[1]) * 1000 : 60000,
            };
        }
        // Auth failure
        if (/unauthorized|invalid.*key|authentication.*fail|401/i.test(message)) {
            return {
                type: 'auth_failure',
                message: 'Authentication failed. Please check your API key.',
            };
        }
        // Network error
        if (/econnrefused|etimedout|network|socket|dns/i.test(message)) {
            return {
                type: 'network_error',
                message: 'Network connection failed. Please check your internet connection.',
            };
        }
        // Timeout
        if (/timeout|timed out/i.test(message)) {
            return {
                type: 'timeout',
                message: 'Command timed out. The CLI may be unresponsive.',
            };
        }
        // Not found
        if (/not found|enoent|no such file/i.test(message)) {
            return {
                type: 'not_found',
                message: 'CLI executable not found.',
            };
        }
        // Default
        return {
            type: 'execution_failed',
            message: 'Failed to execute CLI command.',
            details: message,
        };
    }
    // ============================================================================
    // Configuration Helpers
    // ============================================================================
    getConfig(tool) {
        const configs = {
            claude_code: {
                name: 'Claude Code CLI',
                executable: 'claude',
                npmPackage: '@anthropic-ai/claude-code',
            },
            gemini_cli: {
                name: 'Gemini CLI',
                executable: 'gemini',
                npmPackage: '@google/gemini-cli',
            },
        };
        return configs[tool];
    }
    getInstallCommand(tool) {
        // Claude Code has switched to native installer
        if (tool === 'claude_code') {
            if (isWindows) {
                return 'irm https://claude.ai/install.ps1 | iex';
            }
            return 'curl -fsSL https://claude.ai/install.sh | bash';
        }
        // Gemini CLI still uses npm
        const config = this.getConfig(tool);
        return `npm install -g ${config.npmPackage}`;
    }
    getUpdateCommand(tool) {
        // Claude Code uses its own update command
        if (tool === 'claude_code') {
            return 'claude update';
        }
        // Gemini CLI uses npm update (same as install)
        return null;
    }
}
// Export singleton instance getter
export function getCLIToolManager() {
    return CLIToolManager.getInstance();
}
