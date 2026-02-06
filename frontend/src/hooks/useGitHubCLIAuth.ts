/**
 * useGitHubCLIAuth - GitHub CLI authentication hook
 * 
 * Eliminates duplicate GitHub CLI auth logic across:
 * - GitHubSetup.tsx (DesktopGitHubSetup component)
 * - GitHubCLIProviderRow.tsx
 * 
 * Provides:
 * - CLI status checking on mount
 * - Device code event listeners
 * - User sync with backend
 * - Auth start/cancel handlers
 */

import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { usersApi } from '@/api/users'
import { githubApi } from '@/api/github'
import type { 
  GitHubCLIStatus, 
  GitHubDeviceCodeEvent, 
  GitHubAuthResult 
} from '@/types/electron'

export interface UseGitHubCLIAuthOptions {
  /** Whether to create a new user if not exists (default: false) */
  allowUserCreation?: boolean
  /** Callback when auth completes successfully */
  onAuthComplete?: (username: string) => void
  /** Callback when auth fails */
  onAuthError?: (error: string) => void
  /** i18n translation function for toast messages */
  t?: (key: string) => string
}

export interface UseGitHubCLIAuthReturn {
  // State
  cliStatus: GitHubCLIStatus | null
  isCheckingCLI: boolean
  isAuthenticating: boolean
  deviceCode: string | null
  verificationUri: string | null
  
  // Actions
  startAuth: () => Promise<void>
  cancelAuth: () => Promise<void>
  refreshStatus: () => Promise<void>
  
  // Computed
  isElectron: boolean
  isAuthenticated: boolean
  username: string | null
}

export function useGitHubCLIAuth(
  options: UseGitHubCLIAuthOptions = {}
): UseGitHubCLIAuthReturn {
  const { 
    allowUserCreation = false, 
    onAuthComplete, 
    onAuthError,
    t = (key: string) => key 
  } = options
  
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user, setUser } = useUserStore()
  
  // State
  const [cliStatus, setCLIStatus] = useState<GitHubCLIStatus | null>(null)
  const [isCheckingCLI, setIsCheckingCLI] = useState(true)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [deviceCode, setDeviceCode] = useState<string | null>(null)
  const [verificationUri, setVerificationUri] = useState<string | null>(null)
  
  const isElectron = typeof window !== 'undefined' && !!window.electron
  
  /**
   * Sync GitHub user info with backend
   */
  const syncGitHubUser = useCallback(async (username: string, token?: string) => {
    try {
      let userId: number | null = null

      if (user) {
        // Update existing user with GitHub info
        const response = await usersApi.update(user.id, {
          github_username: username,
        })
        setUser(response.data)
        userId = response.data.id
      } else if (allowUserCreation) {
        // Create new user with GitHub info
        const response = await usersApi.create({
          name: username,
          github_username: username,
        })
        setUser(response.data)
        localStorage.setItem('user_id', String(response.data.id))
        userId = response.data.id
      }

      // If we have a token, store it in backend for API calls
      if (token && userId) {
        try {
          await githubApi.saveToken(userId, token)
          console.log('[GitHub CLI] Token saved successfully')
        } catch (error: any) {
          console.error('[GitHub CLI] Failed to save token:', error)
          // Non-critical error, just log it
        }
      }

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['user-stats'] })
      queryClient.invalidateQueries({ queryKey: ['github-status'] })
      queryClient.invalidateQueries({ queryKey: ['oauth-identities'] })
    } catch (error) {
      console.error('Failed to sync GitHub user:', error)
    }
  }, [user, setUser, allowUserCreation, queryClient])
  
  /**
   * Check CLI status and sync if authenticated
   */
  const checkCLIStatus = useCallback(async () => {
    if (!window.electron) return
    
    setIsCheckingCLI(true)
    try {
      const status = await window.electron.getGitHubCLIStatus()
      setCLIStatus(status)
      
      // If authenticated via CLI, get token and sync with backend
      if (status.authenticated && status.username) {
        let token: string | undefined
        try {
          const tokenResult = await window.electron.getGitHubToken()
          if (tokenResult.success && tokenResult.token) {
            token = tokenResult.token
            console.log('[GitHub CLI] Token retrieved successfully')
          } else {
            console.warn('[GitHub CLI] Failed to get token:', tokenResult.error)
          }
        } catch (tokenError) {
          console.error('[GitHub CLI] Error getting token:', tokenError)
        }
        
        await syncGitHubUser(status.username, token)
      }
    } catch (error) {
      console.error('Failed to check GitHub CLI status:', error)
    } finally {
      setIsCheckingCLI(false)
    }
  }, [syncGitHubUser])
  
  // Check CLI status on mount
  useEffect(() => {
    checkCLIStatus()
  }, [checkCLIStatus])
  
  // Listen for device code events
  useEffect(() => {
    if (!window.electron) return

    const unsubscribeDeviceCode = window.electron.onGitHubDeviceCode(
      (data: GitHubDeviceCodeEvent) => {
        setDeviceCode(data.user_code)
        setVerificationUri(data.verification_uri)
      }
    )

    const unsubscribeAuthComplete = window.electron.onGitHubAuthComplete(
      async (data: GitHubAuthResult) => {
        setIsAuthenticating(false)
        setDeviceCode(null)
        setVerificationUri(null)

        if (data.success && data.username) {
          await syncGitHubUser(data.username, data.token)
          
          // Refresh CLI status
          const status = await window.electron!.getGitHubCLIStatus()
          setCLIStatus(status)
          
          // Call success callback
          onAuthComplete?.(data.username)
        } else if (!data.success) {
          const errorMsg = data.error || 'Authentication failed'
          toast({
            title: t('setup.toastError'),
            description: errorMsg,
            variant: 'destructive',
          })
          onAuthError?.(errorMsg)
        }
      }
    )

    return () => {
      unsubscribeDeviceCode()
      unsubscribeAuthComplete()
    }
  }, [syncGitHubUser, toast, t, onAuthComplete, onAuthError])
  
  /**
   * Start GitHub CLI authentication
   */
  const startAuth = useCallback(async () => {
    if (!window.electron) return

    setIsAuthenticating(true)
    setDeviceCode(null)
    setVerificationUri(null)

    try {
      await window.electron.startGitHubAuth()
    } catch (error) {
      console.error('Failed to start GitHub auth:', error)
      setIsAuthenticating(false)
      toast({
        title: t('setup.toastError'),
        description: 'Failed to start authentication',
        variant: 'destructive',
      })
    }
  }, [toast, t])
  
  /**
   * Cancel ongoing authentication
   */
  const cancelAuth = useCallback(async () => {
    if (!window.electron) return

    await window.electron.cancelGitHubAuth()
    setIsAuthenticating(false)
    setDeviceCode(null)
    setVerificationUri(null)
  }, [])
  
  return {
    // State
    cliStatus,
    isCheckingCLI,
    isAuthenticating,
    deviceCode,
    verificationUri,
    
    // Actions
    startAuth,
    cancelAuth,
    refreshStatus: checkCLIStatus,
    
    // Computed
    isElectron,
    isAuthenticated: !!cliStatus?.authenticated,
    username: cliStatus?.username || null,
  }
}
