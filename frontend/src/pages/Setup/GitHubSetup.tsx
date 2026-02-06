import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { useAppStore } from '@/stores/appStore'
import { githubApi } from '@/api/github'
import { usersApi } from '@/api/users'
import { 
  Github, 
  CheckCircle2, 
  ArrowRight, 
  AlertTriangle, 
  RefreshCw, 
  Terminal,
  ExternalLink,
  Copy,
  XCircle
} from 'lucide-react'
import type { GitHubCLIStatus, GitHubDeviceCodeEvent, GitHubAuthResult } from '@/types/electron'

// ============================================================================
// Desktop GitHub Setup (via GitHub CLI)
// ============================================================================

function DesktopGitHubSetup() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const { t } = useTranslation('github')
  const { user, setUser } = useUserStore()
  const queryClient = useQueryClient()
  
  // Get return URL from query params (default to /knowledge/projects)
  const returnUrl = searchParams.get('returnUrl') || '/knowledge/projects'
  
  const [cliStatus, setCLIStatus] = useState<GitHubCLIStatus | null>(null)
  const [isCheckingCLI, setIsCheckingCLI] = useState(true)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [deviceCode, setDeviceCode] = useState<string | null>(null)
  const [verificationUri, setVerificationUri] = useState<string | null>(null)

  // Check GitHub CLI status on mount
  useEffect(() => {
    const checkCLIStatus = async () => {
      if (!window.electron) return
      
      setIsCheckingCLI(true)
      try {
        const status = await window.electron.getGitHubCLIStatus()
        setCLIStatus(status)
        
        // If authenticated via CLI, get token and sync with backend
        if (status.authenticated && status.username) {
          // Get token from CLI to save to backend
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
    }

    checkCLIStatus()
  }, [])

  // Listen for device code events
  useEffect(() => {
    if (!window.electron) return

    const unsubscribeDeviceCode = window.electron.onGitHubDeviceCode((data: GitHubDeviceCodeEvent) => {
      setDeviceCode(data.user_code)
      setVerificationUri(data.verification_uri)
    })

    const unsubscribeAuthComplete = window.electron.onGitHubAuthComplete(async (data: GitHubAuthResult) => {
      setIsAuthenticating(false)
      setDeviceCode(null)
      setVerificationUri(null)

      if (data.success && data.username) {
        await syncGitHubUser(data.username, data.token)
        toast({
          title: t('setup.toastConnected'),
          description: t('setup.toastConnectedDesc'),
        })
        // Refresh CLI status
        const status = await window.electron!.getGitHubCLIStatus()
        setCLIStatus(status)
      } else if (!data.success) {
        toast({
          title: t('setup.toastError'),
          description: data.error || 'Authentication failed',
          variant: 'destructive',
        })
      }
    })

    return () => {
      unsubscribeDeviceCode()
      unsubscribeAuthComplete()
    }
  }, [toast, t])

  // Sync GitHub user with backend
  const syncGitHubUser = async (username: string, token?: string) => {
    try {
      let userId: number | null = null

      // Check if we have a user
      if (user) {
        // Update existing user with GitHub info
        const response = await usersApi.update(user.id, {
          github_username: username,
        })
        setUser(response.data)
        userId = response.data.id
      } else {
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
          const saveResult = await githubApi.saveToken(userId, token)
          console.log('[GitHub] Token saved successfully:', saveResult.data)
        } catch (error: any) {
          console.error('[GitHub] Failed to save token:', error)
          // Show toast notification for token save failure
          toast({
            title: t('setup.tokenSaveError') || 'Token Save Error',
            description: error?.response?.data?.detail || error?.message || 'Failed to save GitHub token. Please try reconnecting.',
            variant: 'destructive',
          })
        }
      } else if (!token) {
        console.warn('[GitHub] No token received from CLI auth')
        toast({
          title: t('setup.tokenMissing') || 'Token Missing',
          description: 'GitHub CLI did not return a token. Please try again.',
          variant: 'destructive',
        })
      }

      queryClient.invalidateQueries({ queryKey: ['user-stats'] })
      queryClient.invalidateQueries({ queryKey: ['github-status'] })
    } catch (error) {
      console.error('Failed to sync GitHub user:', error)
    }
  }

  const handleStartAuth = async () => {
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
  }

  const handleCancelAuth = async () => {
    if (!window.electron) return

    await window.electron.cancelGitHubAuth()
    setIsAuthenticating(false)
    setDeviceCode(null)
    setVerificationUri(null)
  }

  const handleLogout = async () => {
    if (!window.electron) return

    try {
      await window.electron.logoutGitHub()
      
      // Clear user's GitHub info
      if (user) {
        const response = await usersApi.update(user.id, {
          github_username: null,
        })
        setUser(response.data)
      }

      // Refresh CLI status
      const status = await window.electron.getGitHubCLIStatus()
      setCLIStatus(status)

      queryClient.invalidateQueries({ queryKey: ['github-status'] })
      queryClient.invalidateQueries({ queryKey: ['user-stats'] })

      toast({
        title: t('setup.toastDisconnected'),
        description: t('setup.toastDisconnectedDesc'),
      })
    } catch (error) {
      console.error('Failed to logout:', error)
    }
  }

  const copyDeviceCode = () => {
    if (deviceCode) {
      navigator.clipboard.writeText(deviceCode)
      toast({
        title: 'Copied!',
        description: 'Device code copied to clipboard',
      })
    }
  }

  // Loading state
  if (isCheckingCLI) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Checking GitHub CLI...</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  // GitHub CLI not installed
  if (!cliStatus?.installed) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{t('setup.title')}</h1>
          <p className="text-gray-600">{t('setup.description')}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-6 w-6" />
              GitHub CLI Required
            </CardTitle>
            <CardDescription>
              Desktop app requires GitHub CLI (gh) for authentication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
              <AlertTriangle className="h-8 w-8 text-amber-500 flex-shrink-0" />
              <div>
                <p className="font-medium text-amber-900">GitHub CLI not installed</p>
                <p className="text-sm text-amber-700 mt-1">
                  Please install GitHub CLI to connect your GitHub account
                </p>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg space-y-3">
              <h4 className="font-medium">Install GitHub CLI</h4>
              <div className="bg-gray-900 text-gray-100 p-3 rounded font-mono text-sm">
                {cliStatus?.install_command || 'winget install --id GitHub.cli'}
              </div>
              <p className="text-sm text-gray-500">
                After installing, restart the app and try again.
              </p>
            </div>

            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={() => window.open('https://cli.github.com/', '_blank')}
                className="flex-1"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                GitHub CLI Website
              </Button>
              <Button
                onClick={async () => {
                  setIsCheckingCLI(true)
                  const status = await window.electron?.getGitHubCLIStatus()
                  setCLIStatus(status || null)
                  setIsCheckingCLI(false)
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Device Code Flow in progress
  if (isAuthenticating && deviceCode) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{t('setup.title')}</h1>
          <p className="text-gray-600">Complete authentication in your browser</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="h-6 w-6" />
              Enter Device Code
            </CardTitle>
            <CardDescription>
              A browser window should have opened. Enter this code to authenticate:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-center gap-4 p-6 bg-gray-50 rounded-lg">
              <div className="text-4xl font-mono font-bold tracking-widest text-primary">
                {deviceCode}
              </div>
              <Button variant="ghost" size="icon" onClick={copyDeviceCode}>
                <Copy className="h-5 w-5" />
              </Button>
            </div>

            <div className="text-center space-y-2">
              <p className="text-sm text-gray-500">
                If the browser didn't open, go to:
              </p>
              <a
                href={verificationUri || 'https://github.com/login/device'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                {verificationUri || 'https://github.com/login/device'}
                <ExternalLink className="inline ml-1 h-4 w-4" />
              </a>
            </div>

            <div className="flex items-center justify-center gap-2 text-gray-500">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Waiting for authentication...</span>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={handleCancelAuth}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Authenticated state
  if (cliStatus?.authenticated && cliStatus?.username) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{t('setup.title')}</h1>
          <p className="text-gray-600">{t('setup.description')}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="h-6 w-6" />
              {t('setup.cardTitle')}
            </CardTitle>
            <CardDescription>{t('setup.cardDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4 p-4 bg-green-50 rounded-lg">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div className="flex-1">
                <p className="font-medium text-green-900">{t('setup.connected')}</p>
                <p className="text-sm text-green-700">
                  {t('setup.connectedAs', { username: cliStatus.username })}
                </p>
                <p className="text-xs text-green-600 mt-1">
                  via GitHub CLI (gh v{cliStatus.version})
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={handleLogout}
              >
                {t('setup.disconnect')}
              </Button>
              <Button onClick={() => navigate(returnUrl)} className="flex-1">
                {t('setup.continue')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Not authenticated - show login button
  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('setup.title')}</h1>
        <p className="text-gray-600">{t('setup.description')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-6 w-6" />
            {t('setup.cardTitle')}
          </CardTitle>
          <CardDescription>{t('setup.cardDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg text-sm">
            <Terminal className="h-5 w-5 text-blue-500 flex-shrink-0" />
            <span className="text-blue-700">
              GitHub CLI (gh v{cliStatus?.version}) detected
            </span>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <h4 className="font-medium">{t('setup.features')}</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {t('setup.featureRepoList')}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {t('setup.featureCommitAnalysis')}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {t('setup.featureTechDetection')}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {t('setup.featureContribution')}
              </li>
            </ul>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handleStartAuth}
            disabled={isAuthenticating}
          >
            <Github className="mr-2 h-5 w-5" />
            {isAuthenticating ? 'Authenticating...' : t('setup.connect')}
          </Button>

          <Button
            variant="ghost"
            className="w-full"
            onClick={() => navigate('/dashboard')}
          >
            {t('setup.later')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Web GitHub Setup (via OAuth App)
// ============================================================================

function WebGitHubSetup() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { t } = useTranslation('github')
  const [searchParams] = useSearchParams()
  const { user, setUser } = useUserStore()
  const { isElectronApp } = useAppStore()
  const [tokenInvalid, setTokenInvalid] = useState(false)
  const queryClient = useQueryClient()

  // Get return URL from query params (default to /knowledge/projects)
  const returnUrl = searchParams.get('returnUrl') || '/knowledge/projects'

  // Check if redirected from GitHub OAuth
  const userId = searchParams.get('user_id')
  const githubConnected = searchParams.get('github_connected')

  // Check GitHub connection status
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['github-status', user?.id],
    queryFn: () => githubApi.getStatus(user!.id),
    enabled: !!user?.id,
    retry: false,
  })

  // Handle status response
  useEffect(() => {
    if (statusData?.data) {
      const status = statusData.data
      if (status.connected && !status.valid) {
        setTokenInvalid(true)
        toast({
          title: t('setup.toastTokenExpired'),
          description: status.message || t('setup.toastTokenExpiredDesc'),
          variant: 'destructive',
        })
      } else if (status.connected && status.valid) {
        setTokenInvalid(false)
        // Update user info with latest from GitHub
        if (user && (user.github_username !== status.github_username || user.github_avatar_url !== status.avatar_url)) {
          setUser({
            ...user,
            github_username: status.github_username,
            github_avatar_url: status.avatar_url,
          })
        }
      } else if (!status.connected && user?.github_username) {
        // API says not connected but local store has github_username - clear it
        setUser({
          ...user,
          github_username: null,
          github_avatar_url: null,
        })
      }
    }
  }, [statusData, user, setUser, toast, t])

  // Handle OAuth callback completion
  const handleOAuthSuccess = useCallback((oauthUserId: string) => {
    usersApi.getById(parseInt(oauthUserId)).then((response) => {
      setUser(response.data)
      setTokenInvalid(false)
      // Invalidate user-stats query so Dashboard refreshes the GitHub connected state
      queryClient.invalidateQueries({ queryKey: ['user-stats'] })
      toast({
        title: t('setup.toastConnected'),
        description: t('setup.toastConnectedDesc'),
      })
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname)
    })
  }, [setUser, toast, t, queryClient])

  // Fetch updated user info after GitHub OAuth (URL params or localStorage)
  useEffect(() => {
    // 1. Check URL parameters first
    let oauthUserId = userId
    let oauthConnected = githubConnected

    // 2. Check localStorage (Electron OAuth callback)
    if (!oauthUserId) {
      oauthUserId = localStorage.getItem('oauth_callback_user_id')
      oauthConnected = localStorage.getItem('oauth_callback_github_connected')

      if (oauthUserId) {
        // Clean up localStorage after reading
        localStorage.removeItem('oauth_callback_user_id')
        localStorage.removeItem('oauth_callback_github_connected')
        localStorage.removeItem('oauth_callback_path')
      }
    }

    if (oauthUserId && oauthConnected === 'true') {
      handleOAuthSuccess(oauthUserId)
    }
  }, [userId, githubConnected, handleOAuthSuccess])

  // Listen for OAuth callback event (Electron)
  useEffect(() => {
    const handleOAuthCallback = (event: CustomEvent<{ userId: string; githubConnected: string }>) => {
      const { userId: eventUserId, githubConnected: eventConnected } = event.detail
      if (eventUserId && eventConnected === 'true') {
        handleOAuthSuccess(eventUserId)
      }
    }

    window.addEventListener('oauth-callback', handleOAuthCallback as EventListener)
    return () => {
      window.removeEventListener('oauth-callback', handleOAuthCallback as EventListener)
    }
  }, [handleOAuthSuccess])

  const connectMutation = useMutation({
    mutationFn: () => githubApi.connect('/setup/github', isElectronApp, user?.id),
    onSuccess: (response) => {
      // Web: redirect in same window
      window.location.href = response.data.auth_url
    },
    onError: (error: Error) => {
      toast({
        title: t('setup.toastError'),
        description: error.message || t('setup.toastConnectError'),
        variant: 'destructive',
      })
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: () => githubApi.disconnect(user!.id),
    onSuccess: () => {
      if (user) {
        setUser({ ...user, github_username: null, github_avatar_url: null })
      }
      setTokenInvalid(false)
      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['github-status'] })
      queryClient.invalidateQueries({ queryKey: ['user-stats'] })
      toast({
        title: t('setup.toastDisconnected'),
        description: t('setup.toastDisconnectedDesc'),
      })
    },
    onError: (error: Error) => {
      toast({
        title: t('setup.toastError'),
        description: error.message || t('setup.toastDisconnectError'),
        variant: 'destructive',
      })
    },
  })

  const isConnected = !!user?.github_username

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('setup.title')}</h1>
        <p className="text-gray-600">
          {t('setup.description')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-6 w-6" />
            {t('setup.cardTitle')}
          </CardTitle>
          <CardDescription>
            {t('setup.cardDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {statusLoading ? (
            <div className="flex items-center justify-center p-8">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">{t('setup.checkingStatus')}</span>
            </div>
          ) : isConnected && !tokenInvalid ? (
            <>
              <div className="flex items-center gap-4 p-4 bg-green-50 rounded-lg">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <div className="flex-1">
                  <p className="font-medium text-green-900">{t('setup.connected')}</p>
                  <p className="text-sm text-green-700">
                    {t('setup.connectedAs', { username: user.github_username })}
                  </p>
                </div>
                {user.github_avatar_url && (
                  <img
                    src={user.github_avatar_url}
                    alt={user.github_username || ''}
                    className="h-12 w-12 rounded-full"
                  />
                )}
              </div>

              <div className="flex gap-4">
                <Button
                  variant="outline"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  {t('setup.disconnect')}
                </Button>
                <Button onClick={() => navigate(returnUrl)} className="flex-1">
                  {t('setup.continue')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </>
          ) : isConnected && tokenInvalid ? (
            <>
              <div className="flex items-center gap-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                <AlertTriangle className="h-8 w-8 text-amber-500" />
                <div className="flex-1">
                  <p className="font-medium text-amber-900">{t('setup.reconnectRequired')}</p>
                  <p className="text-sm text-amber-700">
                    {t('setup.tokenExpired')}
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    {t('setup.previousAccount', { username: user.github_username })}
                  </p>
                </div>
                {user.github_avatar_url && (
                  <img
                    src={user.github_avatar_url}
                    alt={user.github_username || ''}
                    className="h-12 w-12 rounded-full opacity-50"
                  />
                )}
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
              >
                <RefreshCw className="mr-2 h-5 w-5" />
                {connectMutation.isPending ? t('setup.reconnecting') : t('setup.reconnect')}
              </Button>

              <div className="flex gap-4">
                <Button
                  variant="outline"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  className="flex-1"
                >
                  {t('setup.disconnect')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => navigate('/dashboard')}
                  className="flex-1"
                >
                  {t('setup.later')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                <h4 className="font-medium">{t('setup.features')}</h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {t('setup.featureRepoList')}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {t('setup.featureCommitAnalysis')}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {t('setup.featureTechDetection')}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {t('setup.featureContribution')}
                  </li>
                </ul>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
              >
                <Github className="mr-2 h-5 w-5" />
                {connectMutation.isPending ? t('setup.connecting') : t('setup.connect')}
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => navigate('/dashboard')}
              >
                {t('setup.later')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Main Component - Routes to Desktop or Web version
// ============================================================================

export default function GitHubSetup() {
  const { isElectronApp } = useAppStore()

  // Desktop app uses GitHub CLI for authentication
  if (isElectronApp) {
    return <DesktopGitHubSetup />
  }

  // Web uses OAuth App (requires .env configuration)
  return <WebGitHubSetup />
}
