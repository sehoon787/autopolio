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
 *
 * Detection strategies are in ./cli-detection-strategies.ts
 */
import { isWindows, isMacOS, STATUS_CACHE_TTL, VERSION_CACHE_TTL, NETWORK_TIMEOUT, } from '../types/cli.js';
import { debugLog, getConfig, getInstallCommand, getUpdateCommand, findInHomebrew, findInSystemPath, findInNpmGlobal, findInNvm, findInKnownPaths, findViaPowerShell, executeCLI, validateCLI, compareVersions, classifyError, } from './cli-detection-strategies.js';
// Re-export CLI_CONFIGS for convenience
export { CLI_CONFIGS } from '../types/cli.js';
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
     * Note: github_cli is handled separately via main.ts GitHub CLI handlers
     */
    async refreshAll() {
        const claude = await this.refreshCLI('claude_code');
        const gemini = await this.refreshCLI('gemini_cli');
        const codex = await this.refreshCLI('codex_cli');
        const github = await this.refreshCLI('github_cli');
        return {
            claude_code: claude,
            gemini_cli: gemini,
            codex_cli: codex,
            github_cli: github,
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
                message: `${getConfig(tool).name} is not installed`,
                error: {
                    type: 'not_installed',
                    message: 'CLI is not installed. Please install it first.',
                },
            };
        }
        try {
            // Send a real prompt to test the CLI works end-to-end (like API provider test)
            const testPrompt = "Reply with only 'OK' and nothing else.";
            const args = ['-p', testPrompt, '--output-format', 'json'];
            if (model) {
                args.push('--model', model);
            }
            const CLI_TEST_TIMEOUT = 60_000; // 60s for LLM response
            const result = await executeCLI(status.path, args, CLI_TEST_TIMEOUT);
            const rawOutput = result.stdout.trim();
            // Parse JSON output for content and tokens
            const { content, tokens } = this.parseTestOutput(rawOutput, tool);
            console.log(`[CLI Test] ${tool} response: ${JSON.stringify(content).substring(0, 200)}, tokens=${tokens}`);
            debugLog(`CLI test output: ${content.substring(0, 200)}`);
            debugLog(`CLI test tokens: ${tokens}`);
            return {
                success: true,
                tool,
                message: content || `${getConfig(tool).name} is working correctly`,
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
                message: `Failed to run ${getConfig(tool).name}`,
                path: status.path,
                error: classifyError(errorMessage),
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
            if (tool === 'codex_cli' && 'output' in data) {
                const content = typeof data.output === 'string' ? data.output : String(data.output);
                const usage = data.usage || {};
                const tokens = usage.total_tokens || (usage.input_tokens || 0) + (usage.output_tokens || 0);
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
        const config = getConfig(tool);
        debugLog(`Detecting ${config.name}...`);
        const status = {
            tool,
            installed: false,
            version: null,
            latest_version: null,
            is_outdated: false,
            path: null,
            install_command: getInstallCommand(tool),
            update_command: getUpdateCommand(tool),
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
            foundPath = await safeDetect('Homebrew', () => findInHomebrew(config.executable));
        }
        // 2. System PATH with augmented environment
        if (!foundPath) {
            foundPath = await safeDetect('system PATH', () => findInSystemPath(config.executable));
        }
        // 3. npm global directory
        if (!foundPath) {
            foundPath = await safeDetect('npm global', () => findInNpmGlobal(config.executable));
        }
        // 4. NVM paths (Unix only, sorted by version - newest first)
        if (!foundPath && !isWindows) {
            foundPath = await safeDetect('NVM', () => findInNvm(config.executable));
        }
        // 5. Known installation paths (fallback)
        if (!foundPath) {
            foundPath = await safeDetect('known paths', () => findInKnownPaths(tool));
        }
        // 6. PowerShell Get-Command fallback (Windows only)
        if (!foundPath && isWindows) {
            foundPath = await safeDetect('PowerShell', () => findViaPowerShell(config.executable));
        }
        // Validate found path and get version
        if (foundPath) {
            debugLog(`Found ${config.name} at: ${foundPath}`);
            try {
                const validation = await Promise.race([
                    validateCLI(foundPath),
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
                status.is_outdated = compareVersions(status.version, status.latest_version);
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
        const config = getConfig(tool);
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
}
// Export singleton instance getter
export function getCLIToolManager() {
    return CLIToolManager.getInstance();
}
