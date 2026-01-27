import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useUserStore } from '@/stores/userStore'
import { useToast } from '@/components/ui/use-toast'
import {
  Info,
  AlertCircle,
  Terminal,
  Key,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  RefreshCw,
  ExternalLink
} from 'lucide-react'
import { llmApi, LLMProvider } from '@/api/llm'
import { CLIStatusCard } from '@/components/CLIStatusCard'
import { LLMProviderCard } from '@/components/LLMProviderCard'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { useAppStore } from '@/stores/appStore'
import {
  getClaudeCLIStatus,
  getGeminiCLIStatus,
  refreshCLIStatus as refreshCLIStatusElectron,
  testCLI as testCLIElectron,
  type CLIType,
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
  const { toast } = useToast()
  const {
    isElectronApp,
    aiMode,
    selectedCLI,
    selectedLLMProvider,
    setAIMode,
    setSelectedCLI,
    setSelectedLLMProvider
  } = useAppStore()
  const queryClient = useQueryClient()
  const { showCLIStatus, showAPIKeys, showDesktopDownloadNotice } = useFeatureFlags()

  // Test states
  const [testingCLI, setTestingCLI] = useState<string | null>(null)
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

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
  const { data: llmConfig, isLoading: isLoadingConfig, isError: isConfigError } = useQuery({
    queryKey: ['llmConfig', user?.id],
    queryFn: async () => {
      const response = await llmApi.getConfig(user?.id)
      return response.data
    },
    enabled: showAPIKeys,
    retry: 1,
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
      return llmApi.refreshCLI()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claudeCLIStatus'] })
      queryClient.invalidateQueries({ queryKey: ['geminiCLIStatus'] })
    },
  })

  // Test CLI mutation - uses Electron IPC for direct CLI testing
  const testCLIMutation = useMutation({
    mutationFn: async (cliType: 'claude_code' | 'gemini_cli') => {
      // Use Electron IPC for direct CLI testing (fixes the error)
      if (isElectronApp) {
        const result = await testCLIElectron(cliType as CLIType)
        if (!result) {
          throw new Error('Failed to test CLI - Electron API not available')
        }
        if (!result.success) {
          throw new Error(result.error?.message || result.message || 'CLI test failed')
        }
        return result
      }
      // Fallback to backend API for web (if needed)
      const response = await llmApi.testCLI(cliType)
      return response.data
    },
    onSuccess: (data) => {
      const message = data.message || 'CLI is working!'
      setTestResult({ type: 'success', message })
      toast({
        title: t('llm.testSuccess', 'Test Successful'),
        description: message,
      })
    },
    onError: (error: Error) => {
      setTestResult({ type: 'error', message: error.message })
      toast({
        title: t('llm.testFailed', 'Test Failed'),
        description: error.message,
        variant: 'destructive',
      })
    },
    onSettled: () => {
      setTestingCLI(null)
    },
  })

  // Test LLM Provider mutation
  const testProviderMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const response = await llmApi.testProvider(providerId)
      return response.data
    },
    onSuccess: (data) => {
      setTestResult({ type: 'success', message: data.response || 'LLM Provider is working!' })
      toast({
        title: t('llm.testSuccess', 'Test Successful'),
        description: `${data.provider}: ${data.response}`,
      })
    },
    onError: (error: Error) => {
      setTestResult({ type: 'error', message: error.message })
      toast({
        title: t('llm.testFailed', 'Test Failed'),
        description: error.message,
        variant: 'destructive',
      })
    },
    onSettled: () => {
      setTestingProvider(null)
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
    setTestResult(null)
  }

  const handleSelectCLI = (cliType: 'claude_code' | 'gemini_cli') => {
    setSelectedCLI(cliType)
    setTestResult(null)
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

  const handleTestCLI = (cliType: 'claude_code' | 'gemini_cli') => {
    setTestingCLI(cliType)
    setTestResult(null)
    testCLIMutation.mutate(cliType)
  }

  const handleTestProvider = (providerId: string) => {
    setTestingProvider(providerId)
    setTestResult(null)
    testProviderMutation.mutate(providerId)
  }

  const handleTabChange = (value: string) => {
    setAIMode(value as 'cli' | 'api')
    setTestResult(null)
  }

  // Get current selection info
  const getCurrentSelection = () => {
    if (aiMode === 'cli') {
      const status = selectedCLI === 'claude_code' ? claudeCLIStatus : geminiCLIStatus
      return {
        type: 'CLI',
        name: selectedCLI === 'claude_code' ? 'Claude Code' : 'Gemini CLI',
        installed: status?.installed ?? false,
        version: status?.version ?? null,
      }
    } else {
      const provider = providers.find(p => p.id === selectedLLMProvider)
      return {
        type: 'API',
        name: provider?.name ?? selectedLLMProvider,
        configured: provider?.configured ?? false,
        model: provider?.selected_model ?? provider?.default_model,
      }
    }
  }

  const currentSelection = getCurrentSelection()

  return (
    <div className="space-y-6">
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

      {/* Current Selection Summary */}
      {isElectronApp && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {aiMode === 'cli' ? <Terminal className="h-4 w-4" /> : <Key className="h-4 w-4" />}
              {t('llm.currentSelection', 'Current Selection')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant={aiMode === 'cli' ? 'default' : 'secondary'}>
                  {currentSelection.type}
                </Badge>
                <span className="font-medium">{currentSelection.name}</span>
                {aiMode === 'cli' && currentSelection.installed && (
                  <span className="text-sm text-muted-foreground">v{currentSelection.version}</span>
                )}
                {aiMode === 'api' && 'model' in currentSelection && (
                  <span className="text-sm text-muted-foreground">{currentSelection.model}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {aiMode === 'cli' && currentSelection.installed && (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
                {aiMode === 'cli' && !currentSelection.installed && (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                {aiMode === 'api' && 'configured' in currentSelection && currentSelection.configured && (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
                {aiMode === 'api' && 'configured' in currentSelection && !currentSelection.configured && (
                  <XCircle className="h-4 w-4 text-yellow-500" />
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (aiMode === 'cli') {
                      handleTestCLI(selectedCLI)
                    } else {
                      handleTestProvider(selectedLLMProvider)
                    }
                  }}
                  disabled={
                    testCLIMutation.isPending ||
                    testProviderMutation.isPending ||
                    (aiMode === 'cli' && !currentSelection.installed)
                  }
                >
                  {(testCLIMutation.isPending || testProviderMutation.isPending) ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Play className="h-4 w-4 mr-1" />
                  )}
                  {t('llm.test', 'Test')}
                </Button>
              </div>
            </div>
            {testResult && (
              <div className={`mt-3 p-2 rounded text-sm ${
                testResult.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {testResult.message}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabs for CLI vs API */}
      {isElectronApp && (
        <Tabs value={aiMode} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="cli" className="flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              {t('llm.cliTab', 'CLI Tools')}
            </TabsTrigger>
            <TabsTrigger value="api" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              {t('llm.apiTab', 'API Providers')}
            </TabsTrigger>
          </TabsList>

          {/* CLI Tools Tab */}
          <TabsContent value="cli" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t('llm.cliDescription', 'Use CLI tools for AI-powered code generation. Select one to use.')}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshCLI}
                disabled={refreshCLIMutation.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${refreshCLIMutation.isPending ? 'animate-spin' : ''}`} />
                {t('llm.refresh', 'Refresh')}
              </Button>
            </div>

            {isLoadingClaudeCLI && isLoadingGeminiCLI ? (
              <>
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </>
            ) : (
              <div className="space-y-3">
                {/* Claude Code CLI */}
                <CLIStatusCard
                  cliType="claude_code"
                  status={claudeCLIStatus ?? null}
                  isLoading={isLoadingClaudeCLI || refreshCLIMutation.isPending}
                  isSelected={selectedCLI === 'claude_code'}
                  onRefresh={handleRefreshCLI}
                  onSelect={() => handleSelectCLI('claude_code')}
                  onTest={() => handleTestCLI('claude_code')}
                  isTesting={testingCLI === 'claude_code'}
                />
                {/* Gemini CLI */}
                <CLIStatusCard
                  cliType="gemini_cli"
                  status={geminiCLIStatus ?? null}
                  isLoading={isLoadingGeminiCLI || refreshCLIMutation.isPending}
                  isSelected={selectedCLI === 'gemini_cli'}
                  onRefresh={handleRefreshCLI}
                  onSelect={() => handleSelectCLI('gemini_cli')}
                  onTest={() => handleTestCLI('gemini_cli')}
                  isTesting={testingCLI === 'gemini_cli'}
                />
              </div>
            )}
          </TabsContent>

          {/* API Providers Tab */}
          <TabsContent value="api" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              {t('llm.apiDescription', 'Configure API keys and select a provider for AI features. Select one to use.')}
            </p>

            {isConfigError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('llm.loadError', 'Failed to load LLM settings from backend. Showing defaults.')}
                </AlertDescription>
              </Alert>
            )}

            {isLoadingConfig ? (
              <>
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </>
            ) : (
              <div className="space-y-3">
                {providers.map((provider) => (
                  <LLMProviderCard
                    key={provider.id}
                    provider={provider}
                    isSelected={selectedLLMProvider === provider.id}
                    onSaveKey={handleSaveKey}
                    onValidateKey={handleValidateKey}
                    onSelect={handleSelectProvider}
                    onModelChange={handleModelChange}
                    onTest={() => handleTestProvider(provider.id)}
                    isTesting={testingProvider === provider.id}
                    isUpdating={updateConfigMutation.isPending}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Non-Electron fallback - just show desktop download notice */}
      {!isElectronApp && showDesktopDownloadNotice && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Terminal className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">{t('llm.desktopRequired', 'Desktop App Required')}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t('llm.desktopRequiredDescription', 'CLI tools and API configuration are only available in the desktop app.')}
            </p>
            <Button asChild>
              <a
                href="https://github.com/anthropics/autopolio/releases"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                {t('llm.downloadDesktop', 'Download Desktop App')}
              </a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
