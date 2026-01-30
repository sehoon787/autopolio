import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Terminal, Key } from 'lucide-react'
import { useUserStore } from '@/stores/userStore'
import { useToast } from '@/components/ui/use-toast'
import { llmApi } from '@/api/llm'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { useAppStore } from '@/stores/appStore'
import { useUsageStore, type LLMUsage } from '@/stores/usageStore'
import {
  getClaudeCLIStatus,
  getGeminiCLIStatus,
  refreshCLIStatus as refreshCLIStatusElectron,
  refreshSingleCLIStatus as refreshSingleCLIStatusElectron,
  testCLI as testCLIElectron,
  type CLIType,
} from '@/lib/electron'

import { CLITab } from './CLITab'
import { APITab } from './APITab'
import { CurrentSelectionCard } from './CurrentSelectionCard'
import { WebModeSection } from './WebModeSection'
import { DEFAULT_PROVIDERS, type TestResult, type CurrentSelection } from './types'

export default function LLMSection() {
  const { t } = useTranslation('settings')
  const { user } = useUserStore()
  const { toast } = useToast()
  const {
    isElectronApp,
    aiMode,
    selectedCLI,
    selectedLLMProvider,
    claudeCodeModel,
    geminiCLIModel,
    setAIMode,
    setSelectedCLI,
    setSelectedLLMProvider,
    setClaudeCodeModel,
    setGeminiCLIModel,
  } = useAppStore()
  const queryClient = useQueryClient()
  const { showCLIStatus } = useFeatureFlags()

  // Test states
  const [testingCLI, setTestingCLI] = useState<string | null>(null)
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  // Fetch CLI status directly from Electron
  const { data: claudeCLIStatus, isLoading: isLoadingClaudeCLI } = useQuery({
    queryKey: ['claudeCLIStatus'],
    queryFn: getClaudeCLIStatus,
    enabled: isElectronApp && showCLIStatus,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const { data: geminiCLIStatus, isLoading: isLoadingGeminiCLI } = useQuery({
    queryKey: ['geminiCLIStatus'],
    queryFn: getGeminiCLIStatus,
    enabled: isElectronApp && showCLIStatus,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  // Fetch LLM config from backend
  const { data: llmConfig, isLoading: isLoadingConfig, isError: isConfigError } = useQuery({
    queryKey: ['llmConfig', user?.id],
    queryFn: async () => {
      const response = await llmApi.getConfig(user?.id)
      return response.data
    },
    retry: 1,
  })

  // Fetch stored API keys (Electron only)
  const { data: storedKeys } = useQuery({
    queryKey: ['storedKeys', user?.id],
    queryFn: async () => {
      if (!user?.id) return null
      const response = await llmApi.getStoredKeys(user.id)
      return response.data
    },
    enabled: isElectronApp && !!user?.id,
    staleTime: 30 * 1000,
    retry: false,
  })

  // Use API data or fallback to defaults
  const providers = llmConfig?.providers ?? DEFAULT_PROVIDERS
  const envConfiguredProviders = providers.filter(p => p.env_configured)

  const getStoredKeyForProvider = (providerId: string): string | null => {
    if (!storedKeys) return null
    switch (providerId) {
      case 'openai': return storedKeys.openai_api_key
      case 'anthropic': return storedKeys.anthropic_api_key
      case 'gemini': return storedKeys.gemini_api_key
      default: return null
    }
  }

  // Mutations
  const updateConfigMutation = useMutation({
    mutationFn: (data: Parameters<typeof llmApi.updateConfig>[0]) =>
      llmApi.updateConfig(data, user?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llmConfig', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['storedKeys', user?.id] })
    },
  })

  const validateKeyMutation = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: string; apiKey: string }) =>
      llmApi.validateKey(provider, apiKey),
  })

  const refreshClaudeCLIMutation = useMutation({
    mutationFn: async () => {
      if (isElectronApp) {
        return refreshSingleCLIStatusElectron('claude_code')
      }
      return llmApi.refreshCLI()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claudeCLIStatus'] })
    },
  })

  const refreshGeminiCLIMutation = useMutation({
    mutationFn: async () => {
      if (isElectronApp) {
        return refreshSingleCLIStatusElectron('gemini_cli')
      }
      return llmApi.refreshCLI()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geminiCLIStatus'] })
    },
  })

  const refreshAllCLIMutation = useMutation({
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

  const testCLIMutation = useMutation({
    mutationFn: async (cliType: 'claude_code' | 'gemini_cli') => {
      const model = cliType === 'claude_code' ? claudeCodeModel : geminiCLIModel
      if (isElectronApp) {
        const result = await testCLIElectron(cliType as CLIType, model)
        if (!result) throw new Error('Electron API not available')
        if (!result.success) throw new Error(result.error?.message || result.message || 'CLI test failed')
        return result
      }
      const response = await llmApi.testCLI(cliType)
      return response.data
    },
    onSuccess: (data, cliType) => {
      const message = data.message || 'CLI is working!'
      const providerMap: Record<string, keyof LLMUsage> = {
        claude_code: 'claude_code_cli',
        gemini_cli: 'gemini_cli',
      }
      const toolKey = String(data.tool || cliType)
      const provider = providerMap[toolKey]
      if (provider) {
        useUsageStore.getState().incrementLLMCallCount(provider)
        if (data.tokens && data.tokens > 0) {
          useUsageStore.getState().trackTokenUsage(provider, data.tokens)
        }
      }
      setTestResult({ type: 'success', message })
      toast({ title: t('llm.testSuccess', 'Test Successful'), description: message })
    },
    onError: (error: Error) => {
      setTestResult({ type: 'error', message: error.message })
      toast({ title: t('llm.testFailed', 'Test Failed'), description: error.message, variant: 'destructive' })
    },
    onSettled: () => setTestingCLI(null),
  })

  const testProviderMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const response = await llmApi.testProvider(providerId, {
        userId: user?.id,
        useEnv: !isElectronApp,
      })
      return response.data
    },
    onSuccess: (data) => {
      setTestResult({ type: 'success', message: data.response || 'LLM Provider is working!' })
      toast({ title: t('llm.testSuccess', 'Test Successful'), description: `${data.provider}: ${data.response}` })
    },
    onError: (error: Error) => {
      setTestResult({ type: 'error', message: error.message })
      toast({ title: t('llm.testFailed', 'Test Failed'), description: error.message, variant: 'destructive' })
    },
    onSettled: () => setTestingProvider(null),
  })

  // Handlers
  const handleTestKey = async (providerId: string, apiKey: string) => {
    try {
      const response = await llmApi.testProvider(providerId, { apiKey, useEnv: false })
      return { success: response.data.success, response: response.data.response }
    } catch (error) {
      return { success: false, response: error instanceof Error ? error.message : 'Test failed' }
    }
  }

  const handleSaveKey = async (providerId: string, apiKey: string) => {
    if (!user?.id) throw new Error('User not initialized')
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

  const handleTestCLI = (cliType: 'claude_code' | 'gemini_cli') => {
    setTestingCLI(cliType)
    setTestResult(null)
    testCLIMutation.mutate(cliType)
  }

  const handleTestProvider = (providerId: string) => {
    if (!user?.id && isElectronApp) {
      toast({ title: t('llm.testFailed', 'Test Failed'), description: 'User not initialized.', variant: 'destructive' })
      return
    }
    setTestingProvider(providerId)
    setTestResult(null)
    testProviderMutation.mutate(providerId)
  }

  const handleTabChange = (value: string) => {
    setAIMode(value as 'cli' | 'api')
    setTestResult(null)
  }

  // Get current selection info
  const getCurrentSelection = (): CurrentSelection => {
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

      {/* Electron Mode */}
      {isElectronApp && (
        <>
          <CurrentSelectionCard
            aiMode={aiMode}
            currentSelection={currentSelection}
            testResult={testResult}
            isTestingCLI={testCLIMutation.isPending}
            isTestingProvider={testProviderMutation.isPending}
            onTest={() => {
              if (aiMode === 'cli') handleTestCLI(selectedCLI)
              else handleTestProvider(selectedLLMProvider)
            }}
          />

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

            <TabsContent value="cli" className="mt-4">
              <CLITab
                claudeCLIStatus={claudeCLIStatus ?? null}
                geminiCLIStatus={geminiCLIStatus ?? null}
                isLoadingClaudeCLI={isLoadingClaudeCLI}
                isLoadingGeminiCLI={isLoadingGeminiCLI}
                isRefreshingClaudeCLI={refreshClaudeCLIMutation.isPending}
                isRefreshingGeminiCLI={refreshGeminiCLIMutation.isPending}
                isRefreshingAll={refreshAllCLIMutation.isPending}
                selectedCLI={selectedCLI}
                testingCLI={testingCLI}
                claudeCodeModel={claudeCodeModel}
                geminiCLIModel={geminiCLIModel}
                onRefreshAll={() => refreshAllCLIMutation.mutate()}
                onRefreshClaudeCLI={() => refreshClaudeCLIMutation.mutate()}
                onRefreshGeminiCLI={() => refreshGeminiCLIMutation.mutate()}
                onSelectCLI={handleSelectCLI}
                onTestCLI={handleTestCLI}
                onClaudeCodeModelChange={setClaudeCodeModel}
                onGeminiCLIModelChange={setGeminiCLIModel}
              />
            </TabsContent>

            <TabsContent value="api" className="mt-4">
              <APITab
                providers={providers}
                selectedLLMProvider={selectedLLMProvider}
                testingProvider={testingProvider}
                isLoadingConfig={isLoadingConfig}
                isConfigError={isConfigError}
                isUpdating={updateConfigMutation.isPending}
                getStoredKeyForProvider={getStoredKeyForProvider}
                onSaveKey={handleSaveKey}
                onValidateKey={handleValidateKey}
                onTestKey={handleTestKey}
                onSelectProvider={handleSelectProvider}
                onModelChange={handleModelChange}
                onTestStored={handleTestProvider}
              />
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Web Mode */}
      {!isElectronApp && (
        <WebModeSection
          envConfiguredProviders={envConfiguredProviders}
          selectedLLMProvider={selectedLLMProvider}
          currentSelection={currentSelection}
          testResult={testResult}
          testingProvider={testingProvider}
          isLoadingConfig={isLoadingConfig}
          isUpdating={updateConfigMutation.isPending}
          onSaveKey={handleSaveKey}
          onValidateKey={handleValidateKey}
          onTestKey={handleTestKey}
          onSelectProvider={handleSelectProvider}
          onModelChange={handleModelChange}
          onTestProvider={handleTestProvider}
          isTestingProvider={testProviderMutation.isPending}
        />
      )}
    </div>
  )
}
