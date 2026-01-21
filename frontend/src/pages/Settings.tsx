import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useUserStore } from '@/stores/userStore'
import { changeLanguage, getCurrentLanguage, SUPPORTED_LANGUAGES } from '@/lib/i18n'
import { Github, ExternalLink, Bot, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { llmApi } from '@/api/llm'
import { CLIStatusCard } from '@/components/CLIStatusCard'
import { LLMProviderCard } from '@/components/LLMProviderCard'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'

export default function SettingsPage() {
  const { t } = useTranslation(['settings', 'common'])
  const { user } = useUserStore()
  const currentLanguage = getCurrentLanguage()
  const queryClient = useQueryClient()
  const { showCLIStatus, showAPIKeys, showDesktopDownloadNotice } = useFeatureFlags()

  // Fetch LLM config
  const { data: llmConfig, isLoading: isLoadingConfig } = useQuery({
    queryKey: ['llmConfig'],
    queryFn: async () => {
      const response = await llmApi.getConfig()
      return response.data
    },
    enabled: !!user,
  })

  // Update config mutation
  const updateConfigMutation = useMutation({
    mutationFn: llmApi.updateConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llmConfig'] })
    },
  })

  // Validate key mutation
  const validateKeyMutation = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: string; apiKey: string }) =>
      llmApi.validateKey(provider, apiKey),
  })

  // Refresh CLI status
  const refreshCLIMutation = useMutation({
    mutationFn: llmApi.refreshCLI,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llmConfig'] })
    },
  })

  const handleLanguageChange = (value: string) => {
    changeLanguage(value)
  }

  const handleSaveKey = async (providerId: string, apiKey: string) => {
    const updateData: Record<string, string> = {}
    if (providerId === 'openai') updateData.openai_api_key = apiKey
    if (providerId === 'anthropic') updateData.anthropic_api_key = apiKey
    if (providerId === 'gemini') updateData.gemini_api_key = apiKey

    await updateConfigMutation.mutateAsync(updateData)
  }

  const handleValidateKey = async (providerId: string, apiKey: string) => {
    const response = await validateKeyMutation.mutateAsync({ provider: providerId, apiKey })
    return response.data
  }

  const handleSelectPrimary = async (providerId: string) => {
    await updateConfigMutation.mutateAsync({ provider: providerId })
  }

  const handleModelChange = async (providerId: string, model: string) => {
    const updateData: Record<string, string> = {}
    if (providerId === 'openai') updateData.openai_model = model
    if (providerId === 'anthropic') updateData.anthropic_model = model
    if (providerId === 'gemini') updateData.gemini_model = model

    await updateConfigMutation.mutateAsync(updateData)
  }

  const handleRefreshCLI = () => {
    refreshCLIMutation.mutate()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('settings:title')}</h1>
      </div>

      <div className="grid gap-6">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle>{t('settings:general')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('settings:language')}</Label>
              </div>
              <Select value={currentLanguage} onValueChange={handleLanguageChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.nativeName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* AI & CLI Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              {t('settings:llm.title')}
            </CardTitle>
            <CardDescription>{t('settings:llm.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Web Mode Notice */}
            {showDesktopDownloadNotice && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  {t('settings:llm.webModeNotice')}{' '}
                  <a
                    href="https://github.com/anthropics/autopolio/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline underline-offset-4 hover:text-primary"
                  >
                    {t('settings:llm.downloadDesktop')}
                  </a>
                </AlertDescription>
              </Alert>
            )}

            {/* CLI Tools Status - Desktop only */}
            {showCLIStatus && (
              <div>
                <h3 className="text-sm font-medium mb-3">{t('settings:cli.title')}</h3>
                <div className="space-y-4">
                  {isLoadingConfig ? (
                    <>
                      <Skeleton className="h-40 w-full" />
                      <Skeleton className="h-40 w-full" />
                    </>
                  ) : (
                    <>
                      {/* Claude Code CLI */}
                      <CLIStatusCard
                        status={llmConfig?.claude_code_status ?? null}
                        isLoading={refreshCLIMutation.isPending}
                        onRefresh={handleRefreshCLI}
                      />
                      {/* Gemini CLI */}
                      <CLIStatusCard
                        status={llmConfig?.gemini_cli_status ?? null}
                        isLoading={refreshCLIMutation.isPending}
                        onRefresh={handleRefreshCLI}
                      />
                    </>
                  )}
                </div>
              </div>
            )}

            {/* LLM Providers - Desktop only */}
            {showAPIKeys && (
              <div>
                <h3 className="text-sm font-medium mb-3">{t('settings:llm.providers')}</h3>
                <div className="space-y-4">
                  {isLoadingConfig ? (
                    <>
                      <Skeleton className="h-48 w-full" />
                      <Skeleton className="h-48 w-full" />
                      <Skeleton className="h-48 w-full" />
                    </>
                  ) : (
                    llmConfig?.providers.map((provider) => (
                      <LLMProviderCard
                        key={provider.id}
                        provider={provider}
                        onSaveKey={handleSaveKey}
                        onValidateKey={handleValidateKey}
                        onSelectPrimary={handleSelectPrimary}
                        onModelChange={handleModelChange}
                        isUpdating={updateConfigMutation.isPending}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* GitHub Integration */}
        <Card>
          <CardHeader>
            <CardTitle>{t('settings:github.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {user?.github_username ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {user.github_avatar_url ? (
                    <img
                      src={user.github_avatar_url}
                      alt={user.github_username}
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                      <Github className="h-5 w-5 text-gray-500" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Github className="h-4 w-4" />
                      {user.github_username}
                    </p>
                    <p className="text-xs text-green-600">
                      {t('settings:github.connected')}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/setup/github">
                    {t('settings:github.reconnect')}
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {t('settings:github.notConnected')}
                </p>
                <Button asChild>
                  <Link to="/setup/github">
                    <Github className="mr-2 h-4 w-4" />
                    {t('settings:github.connect')}
                  </Link>
                </Button>
              </div>
            )}

            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-2">
                {t('settings:github.features.title')}
              </p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {t('settings:github.features.repoList')}</li>
                <li>• {t('settings:github.features.commitAnalysis')}</li>
                <li>• {t('settings:github.features.techDetection')}</li>
                <li>• {t('settings:github.features.contributionStats')}</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* User Info */}
        {user && (
          <Card>
            <CardHeader>
              <CardTitle>{t('settings:user.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <Label>{t('settings:user.name')}</Label>
                  <span className="text-sm">{user.name}</span>
                </div>
                {user.email && (
                  <div className="flex items-center justify-between">
                    <Label>{t('settings:user.email')}</Label>
                    <span className="text-sm">{user.email}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
