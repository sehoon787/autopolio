import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { useAppStore } from '@/stores/appStore'
import { oauthApi, OAuthIdentity } from '@/api/oauth'
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
import { Github, LogOut, Loader2, Link2, Link2Off, Check, RefreshCw, AlertTriangle } from 'lucide-react'

// Figma icon component
function FigmaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z" />
      <path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z" />
      <path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z" />
      <path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z" />
      <path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z" />
    </svg>
  )
}

// Google icon component
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

// Provider display configuration
const PROVIDER_CONFIG: Record<string, {
  icon: React.ComponentType<{ className?: string }>
  name: string
  color: string
  bgColor: string
  features?: string[]
}> = {
  github: {
    icon: Github,
    name: 'GitHub',
    color: 'text-white',
    bgColor: 'bg-gray-900 hover:bg-gray-800',
    features: [
      'connectedAccounts.features.github.repoList',
      'connectedAccounts.features.github.commitAnalysis',
      'connectedAccounts.features.github.techDetection',
      'connectedAccounts.features.github.contributionStats',
    ],
  },
  google: {
    icon: GoogleIcon,
    name: 'Google',
    color: 'text-white',
    bgColor: 'bg-white border border-gray-200 hover:bg-gray-50',
  },
  figma: {
    icon: FigmaIcon,
    name: 'Figma',
    color: 'text-white',
    bgColor: 'bg-black hover:bg-gray-900',
  },
}

interface OAuthProviderRowProps {
  provider: string
  identity?: OAuthIdentity
  isConfigured: boolean
  onConnect: () => void
  onDisconnect: () => void
  isConnecting?: boolean
  isDisconnecting?: boolean
  showFeatures?: boolean
  isLastAccount?: boolean
}

function OAuthProviderRow({
  provider,
  identity,
  isConfigured,
  onConnect,
  onDisconnect,
  isConnecting,
  isDisconnecting,
  showFeatures = false,
  isLastAccount = false,
}: OAuthProviderRowProps) {
  const { t } = useTranslation('settings')
  const [showDisconnectWarning, setShowDisconnectWarning] = useState(false)

  const config = PROVIDER_CONFIG[provider] || {
    icon: Link2,
    name: provider.charAt(0).toUpperCase() + provider.slice(1),
    color: 'text-white',
    bgColor: 'bg-gray-500',
  }
  const Icon = config.icon

  const handleDisconnectClick = () => {
    if (isLastAccount) {
      setShowDisconnectWarning(true)
    } else {
      onDisconnect()
    }
  }

  const handleConfirmDisconnect = () => {
    setShowDisconnectWarning(false)
    onDisconnect()
  }

  return (
    <>
      <div className="py-4 border-b last:border-b-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.bgColor}`}>
              <Icon className={`h-5 w-5 ${config.color}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{config.name}</p>
                {identity && (
                  <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                    {t('connectedAccounts.connected')}
                  </Badge>
                )}
              </div>
              {identity ? (
                <p className="text-sm text-muted-foreground">
                  @{identity.username}
                </p>
              ) : !isConfigured ? (
                <p className="text-sm text-muted-foreground">
                  {t('connectedAccounts.notConfigured')}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {identity ? (
              <>
                {/* Reconnect button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onConnect}
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  {t('connectedAccounts.reconnect')}
                </Button>
                {/* Disconnect button */}
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
              </>
            ) : isConfigured ? (
              <Button
                size="sm"
                onClick={onConnect}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Link2 className="h-4 w-4 mr-1" />
                )}
                {t('connectedAccounts.connect')}
              </Button>
            ) : (
              <Badge variant="outline">{t('connectedAccounts.comingSoon')}</Badge>
            )}
          </div>
        </div>

        {/* Features list - only show when connected and showFeatures is true */}
        {showFeatures && identity && config.features && (
          <div className="mt-4 ml-12 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm font-medium mb-2">{t('connectedAccounts.features.title')}</p>
            <ul className="space-y-1.5">
              {config.features.map((featureKey) => (
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
              onClick={handleConfirmDisconnect}
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

export default function AccountSection() {
  const { t } = useTranslation('settings')
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user, logout, setUser } = useUserStore()
  const { isElectronApp } = useAppStore()

  // Fetch available providers
  const { data: providersData } = useQuery({
    queryKey: ['oauth-providers'],
    queryFn: () => oauthApi.getProviders(),
  })

  // Fetch user's connected identities
  const { data: identitiesData, isLoading: isLoadingIdentities } = useQuery({
    queryKey: ['oauth-identities', user?.id],
    queryFn: () => oauthApi.getIdentities(user!.id),
    enabled: !!user?.id,
  })

  // Connect mutation
  const connectMutation = useMutation({
    mutationFn: ({ provider }: { provider: string }) =>
      oauthApi.connect(provider, '/settings', isElectronApp, user?.id),
    onSuccess: (response) => {
      if (isElectronApp) {
        window.open(response.data.auth_url, '_blank')
        toast({
          title: t('connectedAccounts.authStarted'),
          description: t('connectedAccounts.authStartedDesc'),
        })
      } else {
        window.location.href = response.data.auth_url
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('connectedAccounts.connectFailed'),
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: ({ provider }: { provider: string }) =>
      oauthApi.disconnect(provider, user!.id),
    onSuccess: (_, { provider }) => {
      queryClient.invalidateQueries({ queryKey: ['oauth-identities'] })
      // Update user store if it was GitHub
      if (provider === 'github' && user) {
        setUser({ ...user, github_username: null, github_avatar_url: null })
      }

      // Check if this was the last connected account
      const remainingIdentities = identities.filter(i => i.provider !== provider)
      const isLastAccount = remainingIdentities.length === 0 && !hasOtherConnections(provider)

      if (isLastAccount) {
        // Logout and redirect to setup
        toast({
          title: t('connectedAccounts.disconnectedAndLogout'),
          description: t('connectedAccounts.guestModeActivated'),
        })
        logout()
        navigate('/setup')
      } else {
        toast({
          title: t('connectedAccounts.disconnected'),
          description: t('connectedAccounts.disconnectedDesc'),
        })
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('connectedAccounts.disconnectFailed'),
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const handleLogout = () => {
    logout()
    navigate('/setup')
  }

  if (!user) {
    return null
  }

  const providers = providersData?.data?.providers || []
  const identities = identitiesData?.data?.identities || []

  // Create a map of identities by provider
  const identityMap: Record<string, OAuthIdentity> = {}
  for (const identity of identities) {
    identityMap[identity.provider] = identity
  }

  // Check if GitHub is connected (from user store for backwards compatibility)
  const isGitHubConnected = !!user.github_username || !!identityMap['github']

  // Helper to check if there are other connections besides the given provider
  const hasOtherConnections = (excludeProvider: string) => {
    if (excludeProvider !== 'github' && isGitHubConnected) return true
    return identities.some(i => i.provider !== excludeProvider)
  }

  // Count total connected accounts
  const connectedCount = identities.length + (isGitHubConnected && !identityMap['github'] ? 1 : 0)

  return (
    <div className="space-y-8">
      {/* Profile Section */}
      <div>
        <h2 className="text-xl font-semibold">{t('user.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('user.description')}
        </p>
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-4">
          {user.github_avatar_url ? (
            <img
              src={user.github_avatar_url}
              alt={user.name || 'User'}
              className="h-16 w-16 rounded-full"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <span className="text-2xl font-medium text-muted-foreground">
                {user.name?.charAt(0) || 'U'}
              </span>
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-lg font-medium">{user.name || 'User'}</h3>
            {user.email && (
              <p className="text-sm text-muted-foreground">{user.email}</p>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Connected Accounts Section */}
      <div>
        <h2 className="text-xl font-semibold">{t('connectedAccounts.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('connectedAccounts.description')}
        </p>
      </div>

      <div className="rounded-lg border p-4">
        {isLoadingIdentities ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div>
            {/* GitHub - main provider with features */}
            <OAuthProviderRow
              provider="github"
              identity={identityMap['github'] || (isGitHubConnected ? {
                id: 0,
                provider: 'github',
                username: user.github_username || undefined,
                is_primary: true,
                created_at: '',
              } : undefined)}
              isConfigured={providers.find(p => p.name === 'github')?.configured ?? true}
              onConnect={() => connectMutation.mutate({ provider: 'github' })}
              onDisconnect={() => disconnectMutation.mutate({ provider: 'github' })}
              isConnecting={connectMutation.isPending && connectMutation.variables?.provider === 'github'}
              isDisconnecting={disconnectMutation.isPending && disconnectMutation.variables?.provider === 'github'}
              showFeatures={true}
              isLastAccount={connectedCount <= 1}
            />

            {/* Google and Figma - Coming Soon */}
            {['google', 'figma'].map(provider => (
              <OAuthProviderRow
                key={provider}
                provider={provider}
                identity={identityMap[provider]}
                isConfigured={false}
                onConnect={() => connectMutation.mutate({ provider })}
                onDisconnect={() => disconnectMutation.mutate({ provider })}
                isConnecting={connectMutation.isPending && connectMutation.variables?.provider === provider}
                isDisconnecting={disconnectMutation.isPending && disconnectMutation.variables?.provider === provider}
                isLastAccount={connectedCount <= 1}
              />
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Logout Section */}
      <div>
        <h2 className="text-xl font-semibold">{t('logout.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('logout.description')}
        </p>
      </div>

      <Button
        variant="destructive"
        onClick={handleLogout}
        className="w-full sm:w-auto"
      >
        <LogOut className="h-4 w-4 mr-2" />
        {t('logout.button')}
      </Button>
    </div>
  )
}
