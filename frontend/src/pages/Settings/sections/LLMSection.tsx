import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useUserStore } from '@/stores/userStore'
import { Info, AlertCircle } from 'lucide-react'
import { llmApi, LLMProvider } from '@/api/llm'
import { CLIStatusCard } from '@/components/CLIStatusCard'
import { LLMProviderCard } from '@/components/LLMProviderCard'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { useAppStore } from '@/stores/appStore'
import {
  getClaudeCLIStatus,
  getGeminiCLIStatus,
  refreshCLIStatus as refreshCLIStatusElectron,
} from '@/lib/electron'

// Default providers data (fallback when API fails)
const DEFAULT_PROVIDERS: LLMProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4 and GPT-3.5 models for text generation',
    configured: false,
    is_primary: true,
    models: ['gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo'],
    default_model: 'gpt-4-turbo-preview',
    selected_model: 'gpt-4-turbo-preview',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models for text generation',
    configured: false,
    is_primary: false,
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    default_model: 'claude-3-5-sonnet-20241022',
    selected_model: 'claude-3-5-sonnet-20241022',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini models for text generation',
    configured: false,
    is_primary: false,
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    default_model: 'gemini-2.0-flash',
    selected_model: 'gemini-2.0-flash',
  },
]

export default function LLMSection() {
  const { t } = useTranslation('settings')
  const { user } = useUserStore()
  const { isElectronApp, selectedCLI, selectedLLMProvider, setSelectedCLI, setSelectedLLMProvider } = useAppStore()
  const queryClient = useQueryClient()
  const { showCLIStatus, showAPIKeys, showDesktopDownloadNotice } = useFeatureFlags()

  // Fetch CLI status directly from Electron (Auto-Claude style)
  const { data: claudeCLIStatus, isLoading: isLoadingClaudeCLI } = useQuery({
    queryKey: ['claudeCLIStatus'],
    queryFn: getClaudeCLIStatus,
    enabled: isElectronApp && showCLIStatus,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  })

  const { data: geminiCLIStatus, isLoading: isLoadingGeminiCLI } = useQuery({
    queryKey: ['geminiCLIStatus'],
    queryFn: getGeminiCLIStatus,
    enabled: isElectronApp && showCLIStatus,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  })

  // Fetch LLM config from backend (for API keys and provider settings)
  // Works without user - will just show providers without configured status
  const { data: llmConfig, isLoading: isLoadingConfig, isError: isConfigError } = useQuery({
    queryKey: ['llmConfig', user?.id],
    queryFn: async () => {
      const response = await llmApi.getConfig(user?.id)
      return response.data
    },
    enabled: showAPIKeys,
    retry: 1, // Only retry once
  })

  // Use API data or fallback to defaults
  const providers = llmConfig?.providers ?? DEFAULT_PROVIDERS

  // Update config mutation
  const updateConfigMutation = useMutation({
    mutationFn: (data: Parameters<typeof llmApi.updateConfig>[0]) =>
      llmApi.updateConfig(data, user?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llmConfig', user?.id] })
    },
  })

  // Validate key mutation
  const validateKeyMutation = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: string; apiKey: string }) =>
      llmApi.validateKey(provider, apiKey),
  })

  // Refresh CLI status (uses Electron IPC directly)
  const refreshCLIMutation = useMutation({
    mutationFn: async () => {
      if (isElectronApp) {
        return refreshCLIStatusElectron()
      }
      // Fallback to backend API if not in Electron
      return llmApi.refreshCLI()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claudeCLIStatus'] })
      queryClient.invalidateQueries({ queryKey: ['geminiCLIStatus'] })
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

  const handleSelectProvider = (providerId: string) => {
    setSelectedLLMProvider(providerId as 'openai' | 'anthropic' | 'gemini')
  }

  const handleSelectCLI = (cliType: 'claude_code' | 'gemini_cli') => {
    setSelectedCLI(cliType)
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

      {/* CLI Tools Status - Desktop only (Auto-Claude style - direct Electron IPC) */}
      {showCLIStatus && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium">{t('cli.title')}</h3>
          {isLoadingClaudeCLI && isLoadingGeminiCLI ? (
            <>
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </>
          ) : (
            <>
              {/* Claude Code CLI */}
              <CLIStatusCard
                status={claudeCLIStatus ?? null}
                isLoading={isLoadingClaudeCLI || refreshCLIMutation.isPending}
                isSelected={selectedCLI === 'claude_code'}
                onRefresh={handleRefreshCLI}
                onSelect={() => handleSelectCLI('claude_code')}
              />
              {/* Gemini CLI */}
              <CLIStatusCard
                status={geminiCLIStatus ?? null}
                isLoading={isLoadingGeminiCLI || refreshCLIMutation.isPending}
                isSelected={selectedCLI === 'gemini_cli'}
                onRefresh={handleRefreshCLI}
                onSelect={() => handleSelectCLI('gemini_cli')}
              />
            </>
          )}
        </div>
      )}

      {/* LLM Providers - Desktop only */}
      {showAPIKeys && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium">{t('llm.providers')}</h3>

          {/* Error state - show warning but still render UI with defaults */}
          {isConfigError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t('llm.loadError', 'Failed to load LLM settings from backend. Showing defaults. Please ensure the backend is running.')}
              </AlertDescription>
            </Alert>
          )}

          {isLoadingConfig ? (
            <>
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </>
          ) : (
            providers.map((provider) => (
              <LLMProviderCard
                key={provider.id}
                provider={provider}
                isSelected={selectedLLMProvider === provider.id}
                onSaveKey={handleSaveKey}
                onValidateKey={handleValidateKey}
                onSelect={handleSelectProvider}
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
