import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { useAppStore } from '@/stores/appStore'
import { usersApi } from '@/api/users'
import { githubApi } from '@/api/github'
import { Github, UserX, Loader2, CheckCircle2 } from 'lucide-react'

export default function SetupPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { t } = useTranslation('github')
  const [searchParams] = useSearchParams()
  const { user, setUser, startGuestMode } = useUserStore()
  const { isElectronApp } = useAppStore()
  const queryClient = useQueryClient()
  const [isConnecting, setIsConnecting] = useState(false)

  // Check if redirected from OAuth
  const userId = searchParams.get('user_id')
  const githubConnected = searchParams.get('github_connected')

  // Handle OAuth callback completion
  const handleOAuthSuccess = useCallback((oauthUserId: string) => {
    usersApi.getById(parseInt(oauthUserId)).then((response) => {
      setUser(response.data)
      queryClient.invalidateQueries({ queryKey: ['user-stats'] })
      toast({
        title: t('setup.toastConnected'),
        description: t('setup.toastConnectedDesc'),
      })
      // Clear URL params and navigate to dashboard
      window.history.replaceState({}, '', window.location.pathname)
      navigate('/dashboard')
    }).catch((error) => {
      console.error('[Setup] Failed to fetch user after OAuth:', error)
      toast({
        title: t('setup.toastError'),
        description: t('setup.toastConnectError'),
        variant: 'destructive',
      })
    })
  }, [setUser, toast, t, queryClient, navigate])

  // Handle OAuth callback from URL params or localStorage (Electron)
  useEffect(() => {
    let oauthUserId = userId
    let oauthConnected = githubConnected

    // Check localStorage for Electron OAuth callback
    if (!oauthUserId) {
      oauthUserId = localStorage.getItem('oauth_callback_user_id')
      oauthConnected = localStorage.getItem('oauth_callback_github_connected')

      if (oauthUserId) {
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

  // GitHub OAuth connect mutation (uses existing /api/github/connect endpoint)
  const connectMutation = useMutation({
    mutationFn: () => githubApi.connect('/setup', isElectronApp),
    onSuccess: (response) => {
      if (isElectronApp) {
        window.open(response.data.auth_url, '_blank')
        toast({
          title: t('setup.toastAuth'),
          description: t('setup.toastAuthDesc'),
        })
        setIsConnecting(false)
      } else {
        window.location.href = response.data.auth_url
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('setup.toastError'),
        description: error.message || t('setup.toastConnectError'),
        variant: 'destructive',
      })
      setIsConnecting(false)
    },
  })

  const handleConnect = () => {
    setIsConnecting(true)
    connectMutation.mutate()
  }

  const handleStartAsGuest = () => {
    startGuestMode()
    navigate('/platforms')
  }

  // If already logged in, redirect to dashboard
  if (user) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <CardTitle>{t('setup.alreadyLoggedIn')}</CardTitle>
            <CardDescription>
              {t('setup.loggedInAs', { name: user.name || user.github_username || 'User' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => navigate('/dashboard')} className="w-full">
              {t('setup.goToDashboard')}
            </Button>
            <Button variant="outline" onClick={() => navigate('/knowledge/projects')} className="w-full">
              {t('setup.goToProjects')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto mt-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('setup.welcomeTitle')}</h1>
        <p className="text-muted-foreground">
          {t('setup.welcomeSubtitle')}
        </p>
      </div>

      {/* Main login card */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            {t('setup.socialLogin')}
          </CardTitle>
          <CardDescription>
            {t('setup.socialLoginDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Features list */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <p className="text-sm font-medium">{t('setup.features')}</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                {t('setup.featureRepoList')}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                {t('setup.featureCommitAnalysis')}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                {t('setup.featureTechDetection')}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                {t('setup.featureContribution')}
              </li>
            </ul>
          </div>

          {/* GitHub login button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleConnect}
            disabled={isConnecting || connectMutation.isPending}
          >
            {isConnecting || connectMutation.isPending ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Github className="mr-2 h-5 w-5" />
            )}
            {isConnecting || connectMutation.isPending
              ? t('setup.connecting')
              : t('setup.connectWithGitHub')}
          </Button>
        </CardContent>
      </Card>

      {/* Guest mode option */}
      <Card className="border-dashed opacity-80 hover:opacity-100 transition-opacity">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
            <UserX className="h-5 w-5" />
            {t('setup.guestMode')}
          </CardTitle>
          <CardDescription>
            {t('setup.guestModeDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="ghost" className="w-full" onClick={handleStartAsGuest}>
            {t('setup.continueAsGuest')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
