import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { usersApi } from '@/api/users'
import { githubApi } from '@/api/github'
import {
  Github,
  Terminal,
  ExternalLink,
  Copy,
  RefreshCw,
  AlertTriangle,
  Check,
  Link2Off,
  Loader2,
  XCircle,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { GitHubCLIStatus, GitHubDeviceCodeEvent, GitHubAuthResult } from '@/types/electron'

interface GitHubCLIProviderRowProps {
  showFeatures?: boolean
  isLastAccount?: boolean
}

export function GitHubCLIProviderRow({
  showFeatures = false,
  isLastAccount = false,
}: GitHubCLIProviderRowProps) {
  const { t } = useTranslation('settings')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user, setUser, logout } = useUserStore()

  const [cliStatus, setCLIStatus] = useState<GitHubCLIStatus | null>(null)
  const [isCheckingCLI, setIsCheckingCLI] = useState(true)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [deviceCode, setDeviceCode] = useState<string | null>(null)
  const [verificationUri, setVerificationUri] = useState<string | null>(null)
  const [showDisconnectWarning, setShowDisconnectWarning] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

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
          title: t('connectedAccounts.githubCLI.connected'),
          description: t('connectedAccounts.githubCLI.connectedDesc'),
        })
        // Refresh CLI status
        const status = await window.electron!.getGitHubCLIStatus()
        setCLIStatus(status)
        queryClient.invalidateQueries({ queryKey: ['oauth-identities'] })
        queryClient.invalidateQueries({ queryKey: ['user-stats'] })
      } else if (!data.success) {
        toast({
          title: t('connectedAccounts.connectFailed'),
          description: data.error || 'Authentication failed',
          variant: 'destructive',
        })
      }
    })

    return () => {
      unsubscribeDeviceCode()
      unsubscribeAuthComplete()
    }
  }, [toast, t, queryClient])

  // Sync GitHub user with backend
  const syncGitHubUser = async (username: string, token?: string) => {
    try {
      if (user) {
        // Update existing user with GitHub info
        const response = await usersApi.update(user.id, {
          github_username: username,
        })
        setUser(response.data)

        // If we have a token, store it in backend for API calls
        if (token) {
          try {
            await githubApi.saveToken(user.id, token)
          } catch (error) {
            console.log('Token storage not available, will use gh CLI for API calls')
          }
        }
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
        title: t('connectedAccounts.connectFailed'),
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

  const handleDisconnect = async () => {
    if (!window.electron) return

    setIsDisconnecting(true)
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
      queryClient.invalidateQueries({ queryKey: ['oauth-identities'] })
      queryClient.invalidateQueries({ queryKey: ['user-stats'] })

      if (isLastAccount) {
        toast({
          title: t('connectedAccounts.disconnectedAndLogout'),
          description: t('connectedAccounts.guestModeActivated'),
        })
        logout()
      } else {
        toast({
          title: t('connectedAccounts.disconnected'),
          description: t('connectedAccounts.disconnectedDesc'),
        })
      }
    } catch (error) {
      console.error('Failed to logout:', error)
      toast({
        title: t('connectedAccounts.disconnectFailed'),
        description: 'Failed to disconnect',
        variant: 'destructive',
      })
    } finally {
      setIsDisconnecting(false)
      setShowDisconnectWarning(false)
    }
  }

  const handleRefreshStatus = async () => {
    if (!window.electron) return

    setIsCheckingCLI(true)
    try {
      const status = await window.electron.getGitHubCLIStatus()
      setCLIStatus(status)

      if (status.authenticated && status.username) {
        await syncGitHubUser(status.username)
      }
    } catch (error) {
      console.error('Failed to refresh CLI status:', error)
    } finally {
      setIsCheckingCLI(false)
    }
  }

  const copyDeviceCode = () => {
    if (deviceCode) {
      navigator.clipboard.writeText(deviceCode)
      toast({
        title: t('connectedAccounts.githubCLI.copied'),
        description: t('connectedAccounts.githubCLI.copiedDesc'),
      })
    }
  }

  const handleDisconnectClick = () => {
    if (isLastAccount) {
      setShowDisconnectWarning(true)
    } else {
      handleDisconnect()
    }
  }

  const isConnected = cliStatus?.authenticated && cliStatus?.username

  // Loading state
  if (isCheckingCLI) {
    return (
      <div className="py-4 border-b last:border-b-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-900">
            <Github className="h-5 w-5 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {t('connectedAccounts.githubCLI.checking')}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // GitHub CLI not installed
  if (!cliStatus?.installed) {
    return (
      <div className="py-4 border-b last:border-b-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-900">
              <Github className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">GitHub</p>
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-600">
                  <Terminal className="h-3 w-3 mr-1" />
                  {t('connectedAccounts.githubCLI.cliRequired')}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('connectedAccounts.githubCLI.installRequired')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('https://cli.github.com/', '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              {t('connectedAccounts.githubCLI.installGuide')}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleRefreshStatus}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Install command */}
        <div className="mt-3 ml-12 p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground mb-2">
            {t('connectedAccounts.githubCLI.installCommand')}
          </p>
          <code className="block bg-gray-900 text-gray-100 p-2 rounded text-sm font-mono">
            {cliStatus?.install_command || 'winget install --id GitHub.cli'}
          </code>
        </div>
      </div>
    )
  }

  // Device Code Flow in progress
  if (isAuthenticating && deviceCode) {
    return (
      <div className="py-4 border-b last:border-b-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-900">
              <Github className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-medium">GitHub</p>
              <p className="text-sm text-muted-foreground">
                {t('connectedAccounts.githubCLI.enterCode')}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 ml-12 space-y-4">
          {/* Device code display */}
          <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
            <div className="text-2xl font-mono font-bold tracking-widest text-primary">
              {deviceCode}
            </div>
            <Button variant="ghost" size="icon" onClick={copyDeviceCode}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          <div className="text-sm text-muted-foreground space-y-2">
            <p>{t('connectedAccounts.githubCLI.visitUrl')}</p>
            <a
              href={verificationUri || 'https://github.com/login/device'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              {verificationUri || 'https://github.com/login/device'}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t('connectedAccounts.githubCLI.waiting')}</span>
          </div>

          <Button variant="outline" size="sm" onClick={handleCancelAuth}>
            <XCircle className="h-4 w-4 mr-1" />
            {t('connectedAccounts.githubCLI.cancel')}
          </Button>
        </div>
      </div>
    )
  }

  // Connected state
  if (isConnected) {
    return (
      <>
        <div className="py-4 border-b last:border-b-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-900">
                <Github className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">GitHub</p>
                  <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                    {t('connectedAccounts.connected')}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    <Terminal className="h-3 w-3 mr-1" />
                    gh v{cliStatus.version}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">@{cliStatus.username}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshStatus}
                disabled={isCheckingCLI}
              >
                {isCheckingCLI ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                {t('connectedAccounts.reconnect')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnectClick}
                disabled={isDisconnecting}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {isDisconnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2Off className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Features list */}
          {showFeatures && (
            <div className="mt-4 ml-12 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium mb-2">{t('connectedAccounts.features.title')}</p>
              <ul className="space-y-1.5">
                {[
                  'connectedAccounts.features.github.repoList',
                  'connectedAccounts.features.github.commitAnalysis',
                  'connectedAccounts.features.github.techDetection',
                  'connectedAccounts.features.github.contributionStats',
                ].map((featureKey) => (
                  <li key={featureKey} className="text-sm text-muted-foreground flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-green-500" />
                    {t(featureKey)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Warning dialog for disconnecting last account */}
        <AlertDialog open={showDisconnectWarning} onOpenChange={setShowDisconnectWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                {t('connectedAccounts.lastAccountWarning.title')}
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>{t('connectedAccounts.lastAccountWarning.description')}</p>
                <p className="font-medium text-destructive">
                  {t('connectedAccounts.lastAccountWarning.dataWarning')}
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('connectedAccounts.lastAccountWarning.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDisconnect}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t('connectedAccounts.lastAccountWarning.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  // Not authenticated - show connect button
  return (
    <div className="py-4 border-b last:border-b-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-900">
            <Github className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">GitHub</p>
              <Badge variant="secondary" className="text-xs">
                <Terminal className="h-3 w-3 mr-1" />
                gh v{cliStatus?.version}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('connectedAccounts.githubCLI.notAuthenticated')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleStartAuth}
            disabled={isAuthenticating}
          >
            {isAuthenticating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Github className="h-4 w-4 mr-1" />
            )}
            {t('connectedAccounts.connect')}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleRefreshStatus}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
