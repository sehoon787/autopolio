/**
 * useCLIAuth - CLI native authentication hook
 *
 * Supports two paths:
 * - Electron: IPC-based (getCLIAuthStatusElectron, startCLILoginElectron, etc.)
 * - Web local mode: HTTP API-based (llmApi.getCLIAuthStatus, etc.) + polling
 *
 * Provides native OAuth login for CLI tools:
 * - Claude Code: auth status only (no native login)
 * - Gemini CLI: auto Google OAuth on first run
 * - Codex CLI: `codex login` → browser OAuth
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  isElectron,
  getCLIAuthStatus as getCLIAuthStatusElectron,
  startCLILogin as startCLILoginElectron,
  cancelCLILogin as cancelCLILoginElectron,
  cliLogout as cliLogoutElectron,
  type CLIType,
  type CLIAuthStatus,
  type CLILoginResult,
  type CLILoginUrlEvent,
} from '@/lib/electron'
import { llmApi } from '@/api/llm'

export interface UseCLIAuthReturn {
  claudeAuth: CLIAuthStatus | null
  geminiAuth: CLIAuthStatus | null
  codexAuth: CLIAuthStatus | null
  isLoggingIn: CLIType | null
  loginUrl: string | null
  deviceCode: string | null
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
  const [deviceCode, setDeviceCode] = useState<string | null>(null)

  const inElectron = isElectron()
  const isActive = inElectron || !!isLocalMode
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Track auth state before login to detect actual changes (not pre-existing API key auth)
  const preLoginAuthRef = useRef<{ method?: string; email?: string; account?: string } | null>(null)

  /**
   * Check auth status for installed CLIs (fast, no token consumed)
   */
  const refreshAuthStatus = useCallback(async () => {
    if (!isActive) return

    if (inElectron) {
      const [claude, gemini, codex] = await Promise.all([
        getCLIAuthStatusElectron('claude_code'),
        getCLIAuthStatusElectron('gemini_cli'),
        getCLIAuthStatusElectron('codex_cli'),
      ])
      setClaudeAuth(claude)
      setGeminiAuth(gemini)
      setCodexAuth(codex)
    } else {
      // Web local mode: use HTTP API
      const results = await Promise.allSettled([
        llmApi.getCLIAuthStatus('claude_code'),
        llmApi.getCLIAuthStatus('gemini_cli'),
        llmApi.getCLIAuthStatus('codex_cli'),
      ])
      setClaudeAuth(results[0].status === 'fulfilled' ? results[0].value.data : null)
      setGeminiAuth(results[1].status === 'fulfilled' ? results[1].value.data : null)
      setCodexAuth(results[2].status === 'fulfilled' ? results[2].value.data : null)
    }
  }, [isActive, inElectron])

  // Check auth status on mount
  useEffect(() => {
    refreshAuthStatus()
  }, [refreshAuthStatus])

  // Listen for login events from Electron main process
  useEffect(() => {
    if (!inElectron || !window.electron) return

    const unsubscribeUrl = window.electron.onCLILoginUrl(
      (data: CLILoginUrlEvent) => {
        setLoginUrl(data.url)
      }
    )

    const unsubscribeComplete = window.electron.onCLILoginComplete(
      (data: CLILoginResult) => {
        setIsLoggingIn(null)
        setLoginUrl(null)

        if (data.success) {
          refreshAuthStatus()
        }
      }
    )

    return () => {
      unsubscribeUrl()
      unsubscribeComplete()
    }
  }, [inElectron, refreshAuthStatus])

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
   * Start polling auth status (for web local mode after login start)
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
   */
  const login = useCallback(async (tool: CLIType) => {
    if (!isActive) return

    // Record current auth state to detect actual changes during polling
    const currentAuth = tool === 'claude_code' ? claudeAuth
      : tool === 'gemini_cli' ? geminiAuth : codexAuth
    preLoginAuthRef.current = currentAuth ? {
      method: currentAuth.method,
      email: currentAuth.email,
      account: currentAuth.account,
    } : null

    setIsLoggingIn(tool)
    setLoginUrl(null)

    if (inElectron) {
      try {
        const result = await startCLILoginElectron(tool)
        if (result && !result.success) {
          setIsLoggingIn(null)
        }
      } catch {
        setIsLoggingIn(null)
      }
    } else {
      // Web local mode: HTTP API
      // Open blank window NOW (in click context) to avoid popup blocker
      const loginWindow = window.open('about:blank', '_blank')
      try {
        const response = await llmApi.startCLILogin(tool)
        const data = response.data

        if (!data.success) {
          loginWindow?.close()
          setIsLoggingIn(null)
          setDeviceCode(null)
          return
        }

        if (data.url) {
          setLoginUrl(data.url)
          if (loginWindow) {
            loginWindow.location.href = data.url
          }
        } else {
          loginWindow?.close()
        }

        // Extract device code if present (Codex CLI)
        if (data.device_code) {
          setDeviceCode(data.device_code)
        }

        // Start polling for auth completion
        startPolling(tool)
      } catch {
        loginWindow?.close()
        setIsLoggingIn(null)
      }
    }
  }, [isActive, inElectron, startPolling, claudeAuth, geminiAuth, codexAuth])

  /**
   * Cancel ongoing login
   */
  const cancelLogin = useCallback(async () => {
    if (!isActive) return

    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    if (inElectron) {
      await cancelCLILoginElectron()
    } else {
      try {
        await llmApi.cancelCLILogin()
      } catch {
        // Ignore
      }
    }
    setIsLoggingIn(null)
    setLoginUrl(null)
    setDeviceCode(null)
  }, [isActive, inElectron])

  /**
   * Logout from a CLI tool
   */
  const logout = useCallback(async (tool: CLIType) => {
    if (!isActive) return

    if (inElectron) {
      await cliLogoutElectron(tool)
    } else {
      try {
        await llmApi.cliLogout(tool)
      } catch {
        // Ignore
      }
    }
    await refreshAuthStatus()
  }, [isActive, inElectron, refreshAuthStatus])

  return {
    claudeAuth,
    geminiAuth,
    codexAuth,
    isLoggingIn,
    loginUrl,
    deviceCode,
    login,
    cancelLogin,
    logout,
    refreshAuthStatus,
  }

}