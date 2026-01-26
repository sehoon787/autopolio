/**
 * CLI Types - Shared type definitions for CLI management
 *
 * Auto-Claude style implementation for Autopolio
 */
export const CLI_CONFIGS = {
    claude_code: {
        tool: 'claude_code',
        name: 'Claude Code CLI',
        executable: 'claude',
        npmPackage: '@anthropic-ai/claude-code',
        docsUrl: 'https://claude.ai/code',
        changelogUrl: 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md',
    },
    gemini_cli: {
        tool: 'gemini_cli',
        name: 'Gemini CLI',
        executable: 'gemini',
        npmPackage: '@google/gemini-cli',
        docsUrl: 'https://ai.google.dev/gemini-cli',
        changelogUrl: 'https://github.com/google-gemini/gemini-cli/releases',
    },
};
// ============================================================================
// Platform Constants
// ============================================================================
export const isWindows = process.platform === 'win32';
export const isMacOS = process.platform === 'darwin';
export const isLinux = process.platform === 'linux';
// Cache durations
export const STATUS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for CLI status
export const VERSION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours for npm versions
// Timeouts
export const COMMAND_TIMEOUT = 30000; // 30 seconds for CLI commands
export const NETWORK_TIMEOUT = 10000; // 10 seconds for network requests
// Debug flag - set to true to enable verbose logging
// In production, this should be false or controlled via environment variable
export const CLI_DEBUG = process.env.CLI_DEBUG === 'true' || process.env.NODE_ENV === 'development' || true;
