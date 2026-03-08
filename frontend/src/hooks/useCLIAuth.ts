/**
 * useCLIAuth - CLI native authentication hook
 *
 * Uses HTTP API for all operations (auth status, login, cancel, logout).
 * Login completion is detected via polling (2s interval).
 *
 * Provides native OAuth login for CLI tools:
 * - Claude Code: auth status only (no native login)
 * - Gemini CLI: auto Google OAuth on first run
 * - Codex CLI: `codex login` → browser OAuth
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { CLIType, CLIAuthStatus } from '@/lib/electron'
import { llmApi } from '@/api/llm'
import { CLI_TYPES } from '@/constants'

export interface UseCLIAuthReturn {
  claudeAuth: CLIAuthStatus | null
  geminiAuth: CLIAuthStatus | null
  codexAuth: CLIAuthStatus | null
  isLoggingIn: CLIType | null
  loginUrl: string | null
  login: (tool: CLIType) => Promise<void>
  cancelLogin: () => Promise<void>
  logout: (tool: CLIType) => Promise<void>
  refreshAuthStatus: () => Promise<void>
}

export function useCLIAuth(isLocalMode?: boolean): UseCLIAuthReturn {
  const [claudeAuth, setClaudeAuth] = useState<CLIAuthStatus | null>(null)
  const [geminiAuth, setGeminiAuth] = useState<CLIAuthStatus | null>(null)
  const [codexAuth, setCodexAuth] = useState<CLIAuthStatus | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState<CLIType | null>(null)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)

  const { isElectronApp } = useAppStore()
  const isActive = !!isLocalMode
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Track auth state before login to detect actual changes (not pre-existing API key auth)
  const preLoginAuthRef = useRef<{ method?: string; email?: string; account?: string } | null>(null)

  /**
   * Check auth status for installed CLIs (fast, no token consumed)
   */
  const refreshAuthStatus = useCallback(async () => {
    if (!isActive) return

    const results = await Promise.allSettled([
      llmApi.getCLIAuthStatus(CLI_TYPES.CLAUDE_CODE),
      llmApi.getCLIAuthStatus(CLI_TYPES.GEMINI_CLI),
      llmApi.getCLIAuthStatus(CLI_TYPES.CODEX_CLI),
    ])
    setClaudeAuth(results[0].status === 'fulfilled' ? results[0].value.data : null)
    setGeminiAuth(results[1].status === 'fulfilled' ? results[1].value.data : null)
    setCodexAuth(results[2].status === 'fulfilled' ? results[2].value.data : null)
  }, [isActive])

  // Check auth status on mount
  useEffect(() => {
    refreshAuthStatus()
  }, [refreshAuthStatus])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [])

  /**
   * Start polling auth status (for login completion detection)
   */
  const startPolling = useCallback((tool: CLIType) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
    }

    pollingRef.current = setInterval(async () => {
      try {
        const response = await llmApi.getCLIAuthStatus(tool)
        if (response.data.authenticated) {
          const pre = preLoginAuthRef.current
          // Only treat as new login success if auth state actually changed
          // (e.g., method changed from api_key to oauth, or new email/account appeared)
          // If pre is null (stale closure or unknown baseline), DON'T auto-reset —
          // the user must submit auth code or cancel manually.
          const isNewAuth = pre !== null && (
            response.data.method !== pre.method ||
            (response.data.email != null && response.data.email !== pre.email) ||
            (response.data.account != null && response.data.account !== pre.account)
          )
          if (isNewAuth) {
            // Login complete
            setIsLoggingIn(null)
            setLoginUrl(null)
            preLoginAuthRef.current = null
            if (pollingRef.current) {
              clearInterval(pollingRef.current)
              pollingRef.current = null
            }
            refreshAuthStatus()
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000)

    // Auto-stop polling after 2 minutes
    setTimeout(() => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
        setIsLoggingIn(null)
        setLoginUrl(null)
      }
    }, 120_000)
  }, [refreshAuthStatus])

  /**
   * Start native login for a CLI tool
   * Always uses HTTP API. window.open behavior differs:
   * - Web: pre-open blank window to avoid popup blocker, then navigate
   * - Electron: open URL directly (setWindowOpenHandler opens system browser)
   */
  const login = useCallback(async (tool: CLIType) => {
    if (!isActive) return

    // Record current auth state to detect actual changes during polling
    const currentAuth = tool === CLI_TYPES.CLAUDE_CODE ? claudeAuth
      : tool === CLI_TYPES.GEMINI_CLI ? geminiAuth : codexAuth
    preLoginAuthRef.current = currentAuth ? {
      method: currentAuth.method,
      email: currentAuth.email,
      account: currentAuth.account,
    } : null

    setIsLoggingIn(tool)
    setLoginUrl(null)

    // Web: pre-open blank window to avoid popup blocker
    // Electron: not needed (no popup blocker, setWindowOpenHandler opens system browser)
    const loginWindow = !isElectronApp ? window.open('about:blank', '_blank') : null

    try {
      const response = await llmApi.startCLILogin(tool)
      const data = response.data

      if (!data.success) {
        loginWindow?.close()
        setIsLoggingIn(null)
        return
      }

      if (data.url) {
        setLoginUrl(data.url)
        if (loginWindow) {
          loginWindow.location.href = data.url  // Web: navigate pre-opened window
        } else {
          window.open(data.url, '_blank')  // Electron: system browser via setWindowOpenHandler
        }
      } else {
        loginWindow?.close()
      }

      // Start polling for auth completion
      startPolling(tool)
    } catch {
      loginWindow?.close()
      setIsLoggingIn(null)
    }
  }, [isActive, isElectronApp, startPolling, claudeAuth, geminiAuth, codexAuth])

  /**
   * Cancel ongoing login
   */
  const cancelLogin = useCallback(async () => {
    if (!isActive) return

    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    try {
      await llmApi.cancelCLILogin()
    } catch {
      // Ignore
    }
    setIsLoggingIn(null)
    setLoginUrl(null)
  }, [isActive])

  /**
   * Logout from a CLI tool
   */
  const logout = useCallback(async (tool: CLIType) => {
    if (!isActive) return

    try {
      await llmApi.cliLogout(tool)
    } catch {
      // Ignore
    }
    await refreshAuthStatus()
  }, [isActive, refreshAuthStatus])

  return {
    claudeAuth,
    geminiAuth,
    codexAuth,
    isLoggingIn,
    loginUrl,
    login,
    cancelLogin,
    logout,
    refreshAuthStatus,
  }

}
