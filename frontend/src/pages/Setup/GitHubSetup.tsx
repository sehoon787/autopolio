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
import { Github, CheckCircle2, ArrowRight, AlertTriangle, RefreshCw } from 'lucide-react'

export default function GitHubSetup() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { t } = useTranslation('github')
  const [searchParams] = useSearchParams()
  const { user, setUser } = useUserStore()
  const { isElectronApp } = useAppStore()
  const [tokenInvalid, setTokenInvalid] = useState(false)
  const queryClient = useQueryClient()

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
  }, [statusData, user, setUser, toast])

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
      if (isElectronApp) {
        // Electron: open OAuth in external browser
        // After OAuth, backend will redirect to autopolio:// protocol
        // which will be handled by Electron's protocol handler
        window.open(response.data.auth_url, '_blank')
        toast({
          title: t('setup.toastAuth'),
          description: t('setup.toastAuthDesc'),
        })
      } else {
        // Web: redirect in same window
        window.location.href = response.data.auth_url
      }
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
                <Button onClick={() => navigate('/knowledge/projects')} className="flex-1">
                  {t('setup.goToProjects')}
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
