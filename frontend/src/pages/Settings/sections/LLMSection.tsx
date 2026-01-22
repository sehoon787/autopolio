import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useUserStore } from '@/stores/userStore'
import { Info } from 'lucide-react'
import { llmApi } from '@/api/llm'
import { CLIStatusCard } from '@/components/CLIStatusCard'
import { LLMProviderCard } from '@/components/LLMProviderCard'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'

export default function LLMSection() {
  const { t } = useTranslation('settings')
  const { user } = useUserStore()
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
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">{t('llm.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('llm.description')}</p>
      </div>

      {/* Web Mode Notice */}
      {showDesktopDownloadNotice && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {t('llm.webModeNotice')}{' '}
            <a
              href="https://github.com/anthropics/autopolio/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-4 hover:text-primary"
            >
              {t('llm.downloadDesktop')}
            </a>
          </AlertDescription>
        </Alert>
      )}

      {/* CLI Tools Status - Desktop only */}
      {showCLIStatus && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium">{t('cli.title')}</h3>
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
      )}

      {/* LLM Providers - Desktop only */}
      {showAPIKeys && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium">{t('llm.providers')}</h3>
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
      )}
    </div>
  )
}
