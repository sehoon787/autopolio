import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Terminal, Key } from 'lucide-react'
import { useUserStore } from '@/stores/userStore'
import { useToast } from '@/components/ui/use-toast'
import { llmApi } from '@/api/llm'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { useAppStore, resolveModelForAPI } from '@/stores/appStore'
import { useUsageStore, type LLMUsage } from '@/stores/usageStore'
import {
  getClaudeCLIStatus,
  getGeminiCLIStatus,
  getCodexCLIStatus,
  refreshCLIStatus as refreshCLIStatusElectron,
  refreshSingleCLIStatus as refreshSingleCLIStatusElectron,
  testCLI as testCLIElectron,
  type CLIType,
} from '@/lib/electron'

import { useCLIAuth } from '@/hooks/useCLIAuth'
import { CLITab } from './CLITab'
import { APITab } from './APITab'
import { CurrentSelectionCard } from './CurrentSelectionCard'
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
    codexCLIModel,
    setAIMode,
    setSelectedCLI,
    setSelectedLLMProvider,
    setClaudeCodeModel,
    setGeminiCLIModel,
    setCodexCLIModel,
  } = useAppStore()
  const queryClient = useQueryClient()
  const { showCLIStatus } = useFeatureFlags()

  // Fetch LLM config from backend (must be before useCLIAuth to determine local mode)
  const { data: llmConfig, isLoading: isLoadingConfig, isError: isConfigError } = useQuery({
    queryKey: ['llmConfig', user?.id],
    queryFn: async () => {
      const response = await llmApi.getConfig(user?.id)
      return response.data
    },
    retry: 1,
  })

  // Default to true while loading — show login/key buttons immediately.
  // Only hide if runtime is explicitly 'external' (remote server without CLI access).
  const isLocalMode = !llmConfig || llmConfig.runtime === 'local' || llmConfig.runtime === 'docker'
  // CLI connection/key buttons in Electron + local mode
  const showCLIManagement = isElectronApp || isLocalMode

  // Native CLI auth (Electron + web local mode)
  const {
    claudeAuth,
    geminiAuth,
    codexAuth,
    isLoggingIn,
    loginUrl,
    login: nativeLogin,
    cancelLogin: nativeCancelLogin,
    logout: nativeLogout,
  } = useCLIAuth(isLocalMode)

  // Test states
  const [testingCLI, setTestingCLI] = useState<string | null>(null)
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  // Auth states for CLI
  const [claudeAuthStatus, setClaudeAuthStatus] = useState<'authenticated' | 'auth_failed' | 'unknown'>('unknown')
  const [geminiAuthStatus, setGeminiAuthStatus] = useState<'authenticated' | 'auth_failed' | 'unknown'>('unknown')
  const [codexAuthStatus, setCodexAuthStatus] = useState<'authenticated' | 'auth_failed' | 'unknown'>('unknown')
  const [isCheckingClaudeAuth, setIsCheckingClaudeAuth] = useState(false)
  const [isCheckingGeminiAuth, setIsCheckingGeminiAuth] = useState(false)
  const [isCheckingCodexAuth, setIsCheckingCodexAuth] = useState(false)
  const autoTestedRef = useRef<Set<string>>(new Set())

  // Auth states for API providers
  const [apiAuthStatuses, setApiAuthStatuses] = useState<Record<string, 'authenticated' | 'auth_failed' | 'unknown'>>({})
  const [checkingAuthProviders, setCheckingAuthProviders] = useState<Set<string>>(new Set())
  const [savingKeyProvider, setSavingKeyProvider] = useState<string | null>(null)
  const apiAutoTestedRef = useRef<Set<string>>(new Set())

  // Error messages from auto-test (displayed in card tooltips)
  const [cliAuthMessages, setCliAuthMessages] = useState<Record<string, string>>({})
  const [apiAuthMessages, setApiAuthMessages] = useState<Record<string, string>>({})

  // Fetch CLI status — always (CLI providers are available in web too)
  const { data: claudeCLIStatus, isLoading: isLoadingClaudeCLI } = useQuery({
    queryKey: ['claudeCLIStatus'],
    queryFn: async () => {
      if (isElectronApp) return getClaudeCLIStatus()
      const response = await llmApi.getCLIStatus()
      return response.data
    },
    enabled: showCLIStatus,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const { data: geminiCLIStatus, isLoading: isLoadingGeminiCLI } = useQuery({
    queryKey: ['geminiCLIStatus'],
    queryFn: async () => {
      if (isElectronApp) return getGeminiCLIStatus()
      const response = await llmApi.getGeminiCLIStatus()
      return response.data
    },
    enabled: showCLIStatus,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const { data: codexCLIStatus, isLoading: isLoadingCodexCLI } = useQuery({
    queryKey: ['codexCLIStatus'],
    queryFn: async () => {
      if (isElectronApp) return getCodexCLIStatus()
      const response = await llmApi.getCodexCLIStatus()
      return response.data
    },
    enabled: showCLIStatus,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  // Auto-test CLI auth status when CLI is detected as installed
  const autoTestCLI = async (
    cliType: 'claude_code' | 'gemini_cli' | 'codex_cli',
    model: string,
    setAuthStatus: (s: 'authenticated' | 'auth_failed' | 'unknown') => void,
    setIsChecking: (b: boolean) => void,
  ) => {
    setIsChecking(true)
    try {
      if (isElectronApp) {
        const result = await testCLIElectron(cliType as CLIType, model)
        const status = result?.auth_status as 'authenticated' | 'auth_failed' | 'unknown' | undefined
        setAuthStatus(status || (result?.success ? 'authenticated' : 'auth_failed'))
        if (!result?.success && result?.message) {
          setCliAuthMessages(prev => ({ ...prev, [cliType]: result.message }))
        }
      } else {
        const response = await llmApi.testCLI(cliType, model)
        setAuthStatus(response.data.auth_status || (response.data.success ? 'authenticated' : 'auth_failed'))
        if (!response.data.success && response.data.message) {
          setCliAuthMessages(prev => ({ ...prev, [cliType]: response.data.message }))
        }
      }
    } catch (e) {
      setAuthStatus('auth_failed')
      setCliAuthMessages(prev => ({ ...prev, [cliType]: e instanceof Error ? e.message : 'Test failed' }))
    } finally {
      setIsChecking(false)
    }
  }

  // Auto-test CLI connectivity (actual CLI call — definitive auth check)
  // Native auth (useCLIAuth) only provides email/account info, NOT auth status.
  useEffect(() => {
    if (claudeCLIStatus?.installed && !autoTestedRef.current.has('claude_code')) {
      autoTestedRef.current.add('claude_code')
      autoTestCLI('claude_code', claudeCodeModel, setClaudeAuthStatus, setIsCheckingClaudeAuth)
    }
  }, [claudeCLIStatus?.installed, claudeCodeModel, isElectronApp])

  useEffect(() => {
    if (geminiCLIStatus?.installed && !autoTestedRef.current.has('gemini_cli')) {
      autoTestedRef.current.add('gemini_cli')
      autoTestCLI('gemini_cli', geminiCLIModel, setGeminiAuthStatus, setIsCheckingGeminiAuth)
    }
  }, [geminiCLIStatus?.installed, geminiCLIModel, isElectronApp])

  useEffect(() => {
    if (codexCLIStatus?.installed && !autoTestedRef.current.has('codex_cli')) {
      autoTestedRef.current.add('codex_cli')
      autoTestCLI('codex_cli', resolveModelForAPI(codexCLIModel), setCodexAuthStatus, setIsCheckingCodexAuth)
    }
  }, [codexCLIStatus?.installed, codexCLIModel, isElectronApp])

  // Auto-test API provider auth status when configured
  useEffect(() => {
    if (!llmConfig?.providers) return
    for (const provider of llmConfig.providers) {
      if (provider.configured && !apiAutoTestedRef.current.has(provider.id)) {
        apiAutoTestedRef.current.add(provider.id)
        setCheckingAuthProviders(prev => new Set(prev).add(provider.id))
        testProviderForAuth(provider.id)
      }
    }
  }, [llmConfig?.providers])

  // Use API data or fallback to defaults
  const providers = llmConfig?.providers ?? DEFAULT_PROVIDERS

  // Auto-select a configured provider if current selection has no key
  useEffect(() => {
    if (!llmConfig?.providers) return
    const current = llmConfig.providers.find(p => p.id === selectedLLMProvider)
    if (current?.configured) return // already configured, no change needed
    const configured = llmConfig.providers.find(p => p.configured)
    if (configured) {
      setSelectedLLMProvider(configured.id as 'openai' | 'anthropic' | 'gemini')
    }
  }, [llmConfig?.providers])

  // Mutations
  const updateConfigMutation = useMutation({
    mutationFn: (data: Parameters<typeof llmApi.updateConfig>[0]) =>
      llmApi.updateConfig(data, user?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llmConfig', user?.id] })
    },
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

  const refreshCodexCLIMutation = useMutation({
    mutationFn: async () => {
      if (isElectronApp) {
        return refreshSingleCLIStatusElectron('codex_cli' as CLIType)
      }
      return llmApi.refreshCLI()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['codexCLIStatus'] })
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
      queryClient.invalidateQueries({ queryKey: ['codexCLIStatus'] })
    },
  })

  const testCLIMutation = useMutation({
    mutationFn: async (cliType: 'claude_code' | 'gemini_cli' | 'codex_cli') => {
      const rawModel = cliType === 'claude_code' ? claudeCodeModel : cliType === 'codex_cli' ? codexCLIModel : geminiCLIModel
      const model = resolveModelForAPI(rawModel)
      if (isElectronApp) {
        const result = await testCLIElectron(cliType as CLIType, model)
        if (!result) throw new Error('Electron API not available')
        // Don't throw on !success — let onSuccess handle it so auth_status is preserved.
        // Throwing here sends control to onError which hardcodes 'auth_failed',
        // losing the distinction between billing errors (authenticated) and real auth failures.
        return result
      }
      const response = await llmApi.testCLI(cliType, model)
      return response.data
    },
    onSuccess: (data, cliType) => {
      // Update auth status from response (regardless of success)
      const authStatus = (data as { auth_status?: string }).auth_status as 'authenticated' | 'auth_failed' | 'unknown' | undefined
      if (authStatus) {
        if (cliType === 'claude_code') setClaudeAuthStatus(authStatus)
        else if (cliType === 'codex_cli') setCodexAuthStatus(authStatus)
        else setGeminiAuthStatus(authStatus)
      }

      // Backend returned success=false (e.g. auth failed) — treat as failure
      if (!data.success) {
        const message = data.message || 'CLI test failed'
        setTestResult({ type: 'error', message })
        toast({ title: t('llm.testFailed', 'Test Failed'), description: message, variant: 'destructive' })
        return
      }

      // No output = failure
      const output = (data as { output?: string }).output
      if (!output || !output.trim()) {
        setTestResult({ type: 'error', message: 'CLI returned empty response' })
        toast({ title: t('llm.testFailed', 'Test Failed'), description: 'CLI returned empty response', variant: 'destructive' })
        return
      }

      const providerMap: Record<string, keyof LLMUsage> = {
        claude_code: 'claude_code_cli',
        codex_cli: 'codex_cli',
        gemini_cli: 'gemini_cli',
      }
      const toolKey = String(data.tool || cliType)
      const provider = providerMap[toolKey]
      if (provider) {
        useUsageStore.getState().incrementLLMCallCount(provider)
        const tokens = data.tokens || (data as { token_usage?: number }).token_usage || 0
        if (tokens > 0) {
          useUsageStore.getState().trackTokenUsage(provider, tokens)
        }
      }

      // Show provider, model, and response in toast
      const cliNames: Record<string, string> = { claude_code: 'Claude Code', gemini_cli: 'Gemini CLI', codex_cli: 'Codex CLI' }
      const cliName = cliNames[cliType] || cliType
      const modelName = (data as { model?: string }).model || 'default'
      const description = `${cliName} · ${modelName}\n${t('llm.response', 'Response')}: ${output.trim()}`
      setTestResult({ type: 'success', message: description })
      toast({ title: t('llm.testSuccess', 'Test Successful'), description })
    },
    onError: (error: Error, cliType) => {
      // On error, mark as auth_failed
      if (cliType === 'claude_code') setClaudeAuthStatus('auth_failed')
      else if (cliType === 'codex_cli') setCodexAuthStatus('auth_failed')
      else setGeminiAuthStatus('auth_failed')
      setTestResult({ type: 'error', message: error.message })
      toast({ title: t('llm.testFailed', 'Test Failed'), description: error.message, variant: 'destructive' })
    },
    onSettled: () => setTestingCLI(null),
  })

  const saveKeyCLIMutation = useMutation({
    mutationFn: async ({ cliType, apiKey }: { cliType: 'claude_code' | 'gemini_cli' | 'codex_cli'; apiKey: string }) => {
      if (isElectronApp) {
        // Electron: save to user DB
        const providerIds: Record<string, string> = { claude_code: 'anthropic', codex_cli: 'openai', gemini_cli: 'gemini' }
        const providerId = providerIds[cliType] || 'openai'
        await handleSaveKey(providerId, apiKey)
        return { success: true, message: 'Key saved to database' }
      }
      const response = await llmApi.connectCLI(cliType, apiKey)
      return response.data
    },
    onSuccess: (_data, { cliType }) => {
      // Allow re-test to verify new key
      autoTestedRef.current.delete(cliType)
      if (cliType === 'claude_code') setClaudeAuthStatus('unknown')
      else if (cliType === 'codex_cli') setCodexAuthStatus('unknown')
      else setGeminiAuthStatus('unknown')
      queryClient.invalidateQueries({ queryKey: ['llmConfig', user?.id] })
      // Trigger re-test
      handleTestCLI(cliType)
      toast({ title: t('llm.saved', 'Saved successfully!') })
    },
    onError: (error: Error) => {
      toast({ title: t('llm.saveFailed', 'Save failed'), description: error.message, variant: 'destructive' })
    },
  })

  const testProviderMutation = useMutation({
    mutationFn: async (providerId: string) => {
      // Local mode: try user DB keys first, then fall back to .env
      // Electron: user DB keys only (no .env fallback)
      // Docker/External: .env keys (readOnly, no user keys)
      const response = await llmApi.testProvider(providerId, {
        userId: user?.id,
        useEnv: !isElectronApp,
      })
      return response.data
    },
    onSuccess: (data, providerId) => {
      // Update API auth status
      setApiAuthStatuses(prev => ({ ...prev, [providerId]: data.success ? 'authenticated' : 'auth_failed' }))

      if (!data.success) {
        setTestResult({ type: 'error', message: data.response || 'Test failed' })
        toast({ title: t('llm.testFailed', 'Test Failed'), description: data.response, variant: 'destructive' })
        return
      }

      // No response = failure
      if (!data.response || !data.response.trim()) {
        setTestResult({ type: 'error', message: 'API returned empty response' })
        toast({ title: t('llm.testFailed', 'Test Failed'), description: 'API returned empty response', variant: 'destructive' })
        return
      }

      // Show provider, model, and response
      const providerNames: Record<string, string> = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini' }
      const providerName = providerNames[data.provider] || data.provider
      const description = `${providerName} · ${data.model}\n${t('llm.response', 'Response')}: ${data.response.trim()}`
      setTestResult({ type: 'success', message: description })
      toast({ title: t('llm.testSuccess', 'Test Successful'), description })
    },
    onError: (error: Error, providerId) => {
      setApiAuthStatuses(prev => ({ ...prev, [providerId]: 'auth_failed' }))
      setTestResult({ type: 'error', message: error.message })
      toast({ title: t('llm.testFailed', 'Test Failed'), description: error.message, variant: 'destructive' })
    },
    onSettled: () => setTestingProvider(null),
  })

  // Silent auth check for API providers (no toast, no testResult)
  const testProviderForAuth = async (providerId: string) => {
    try {
      const response = await llmApi.testProvider(providerId, {
        userId: user?.id,
        useEnv: !isElectronApp,
      })
      setApiAuthStatuses(prev => ({ ...prev, [providerId]: response.data.success ? 'authenticated' : 'auth_failed' }))
      if (!response.data.success && response.data.response) {
        setApiAuthMessages(prev => ({ ...prev, [providerId]: response.data.response }))
      }
    } catch (e) {
      setApiAuthStatuses(prev => ({ ...prev, [providerId]: 'auth_failed' }))
      setApiAuthMessages(prev => ({ ...prev, [providerId]: e instanceof Error ? e.message : 'Test failed' }))
    } finally {
      setCheckingAuthProviders(prev => {
        const next = new Set(prev)
        next.delete(providerId)
        return next
      })
    }
  }

  const handleRefreshAPIAuth = (providerId: string) => {
    setCheckingAuthProviders(prev => new Set(prev).add(providerId))
    testProviderForAuth(providerId)
  }

  const saveAPIKeyMutation = useMutation({
    mutationFn: async ({ providerId, apiKey }: { providerId: string; apiKey: string }) => {
      // Step 1: Validate
      const validationResponse = await llmApi.validateKey(providerId, apiKey)
      if (!validationResponse.data.valid) {
        throw new Error(validationResponse.data.error || t('llm.invalid'))
      }
      // Step 2: Save
      if (!user?.id) throw new Error('User not initialized')
      const updateData: Record<string, string> = {}
      if (providerId === 'openai') updateData.openai_api_key = apiKey
      if (providerId === 'anthropic') updateData.anthropic_api_key = apiKey
      if (providerId === 'gemini') updateData.gemini_api_key = apiKey
      await updateConfigMutation.mutateAsync(updateData)
      return { providerId }
    },
    onMutate: ({ providerId }) => {
      setSavingKeyProvider(providerId)
    },
    onSuccess: ({ providerId }) => {
      toast({ title: t('llm.saved', 'Saved successfully!') })
      // Allow re-test
      apiAutoTestedRef.current.delete(providerId)
      setApiAuthStatuses(prev => ({ ...prev, [providerId]: 'unknown' }))
      // Trigger re-test
      handleRefreshAPIAuth(providerId)
    },
    onError: (error: Error) => {
      toast({ title: t('llm.saveFailed', 'Save failed'), description: error.message, variant: 'destructive' })
    },
    onSettled: () => {
      setSavingKeyProvider(null)
    },
  })

  // Handlers
  const handleSaveKey = async (providerId: string, apiKey: string) => {
    if (!user?.id) throw new Error('User not initialized')
    const updateData: Record<string, string> = {}
    if (providerId === 'openai') updateData.openai_api_key = apiKey
    if (providerId === 'anthropic') updateData.anthropic_api_key = apiKey
    if (providerId === 'gemini') updateData.gemini_api_key = apiKey
    await updateConfigMutation.mutateAsync(updateData)
  }

  const handleSelectProvider = (providerId: string) => {
    setSelectedLLMProvider(providerId as 'openai' | 'anthropic' | 'gemini')
    setTestResult(null)
  }

  const handleSelectCLI = (cliType: 'claude_code' | 'gemini_cli' | 'codex_cli') => {
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

  const handleTestCLI = (cliType: 'claude_code' | 'gemini_cli' | 'codex_cli') => {
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
  // While a test is running, show the provider/CLI being tested (not the newly selected one)
  const getCurrentSelection = (): CurrentSelection => {
    const cliStatuses: Record<string, typeof claudeCLIStatus> = {
      claude_code: claudeCLIStatus,
      codex_cli: codexCLIStatus,
      gemini_cli: geminiCLIStatus,
    }
    const cliNames: Record<string, string> = {
      claude_code: 'Claude Code',
      codex_cli: 'Codex CLI',
      gemini_cli: 'Gemini CLI',
    }

    // If CLI test is running, show the CLI being tested
    if (testingCLI) {
      const status = cliStatuses[testingCLI] ?? claudeCLIStatus
      return {
        type: 'CLI',
        name: cliNames[testingCLI] || testingCLI,
        installed: status?.installed ?? false,
        version: status?.version ?? null,
      }
    }

    // If API test is running, show the provider being tested
    if (testingProvider) {
      const provider = providers.find(p => p.id === testingProvider)
      return {
        type: 'API',
        name: provider?.name ?? testingProvider,
        configured: provider?.configured ?? false,
        model: provider?.selected_model ?? provider?.default_model,
      }
    }

    if (aiMode === 'cli') {
      const status = cliStatuses[selectedCLI] ?? claudeCLIStatus
      return {
        type: 'CLI',
        name: cliNames[selectedCLI] || selectedCLI,
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

  // Effective checking: show "Checking..." while autoTest hasn't finished
  const effectiveCheckingClaude = isCheckingClaudeAuth ||
    (claudeAuthStatus === 'unknown' && !!claudeCLIStatus?.installed)
  const effectiveCheckingGemini = isCheckingGeminiAuth ||
    (geminiAuthStatus === 'unknown' && !!geminiCLIStatus?.installed)
  const effectiveCheckingCodex = isCheckingCodexAuth ||
    (codexAuthStatus === 'unknown' && !!codexCLIStatus?.installed)

  const currentSelection = getCurrentSelection()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t('llm.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('llm.description')}</p>
      </div>

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
            showAll={showCLIManagement}
            claudeCLIStatus={claudeCLIStatus ?? null}
            geminiCLIStatus={geminiCLIStatus ?? null}
            codexCLIStatus={codexCLIStatus ?? null}
            isLoadingClaudeCLI={isLoadingClaudeCLI}
            isLoadingGeminiCLI={isLoadingGeminiCLI}
            isLoadingCodexCLI={isLoadingCodexCLI}
            isRefreshingClaudeCLI={refreshClaudeCLIMutation.isPending}
            isRefreshingGeminiCLI={refreshGeminiCLIMutation.isPending}
            isRefreshingCodexCLI={refreshCodexCLIMutation.isPending}
            isRefreshingAll={refreshAllCLIMutation.isPending}
            selectedCLI={selectedCLI}
            testingCLI={testingCLI}
            claudeCodeModel={claudeCodeModel}
            geminiCLIModel={geminiCLIModel}
            codexCLIModel={codexCLIModel}
            claudeAuthStatus={claudeAuthStatus}
            geminiAuthStatus={geminiAuthStatus}
            codexAuthStatus={codexAuthStatus}
            claudeAuthMessage={cliAuthMessages.claude_code}
            geminiAuthMessage={cliAuthMessages.gemini_cli}
            codexAuthMessage={cliAuthMessages.codex_cli}
            isCheckingClaudeAuth={effectiveCheckingClaude}
            isCheckingGeminiAuth={effectiveCheckingGemini}
            isCheckingCodexAuth={effectiveCheckingCodex}
            isSavingKey={saveKeyCLIMutation.isPending}
            onRefreshAll={() => refreshAllCLIMutation.mutate()}
            onRefreshClaudeCLI={() => refreshClaudeCLIMutation.mutate()}
            onRefreshGeminiCLI={() => refreshGeminiCLIMutation.mutate()}
            onRefreshCodexCLI={() => refreshCodexCLIMutation.mutate()}
            onSelectCLI={handleSelectCLI}
            onTestCLI={handleTestCLI}
            onClaudeCodeModelChange={setClaudeCodeModel}
            onGeminiCLIModelChange={setGeminiCLIModel}
            onCodexCLIModelChange={setCodexCLIModel}
            onSaveKey={(cliType, apiKey) => saveKeyCLIMutation.mutate({ cliType, apiKey })}
            isNativeLoggingIn={isLoggingIn}
            loginUrl={loginUrl}
            claudeNativeAuthEmail={claudeAuth?.email || (claudeAuth?.authenticated && claudeAuth.method !== 'api_key' ? 'OAuth' : null)}
            geminiNativeAuthAccount={geminiAuth?.account || (geminiAuth?.authenticated ? 'Google OAuth' : null)}
            codexNativeAuthAccount={codexAuth?.account || (codexAuth?.authenticated && codexAuth.method !== 'api_key' ? 'OAuth' : null)}
            onNativeLogin={(isElectronApp || isLocalMode) ? nativeLogin : undefined}
            onCancelNativeLogin={(isElectronApp || isLocalMode) ? nativeCancelLogin : undefined}
            onSubmitAuthCode={async (code) => {
              try {
                const response = await llmApi.submitAuthCode(code)
                if (response.data.success) {
                  toast({ title: t('llm.authCodeSubmitted', 'Auth code submitted. Verifying...') })
                  // Cancel login UI immediately
                  nativeCancelLogin?.()
                  // Wait for CLI to exchange the code for tokens (takes a few seconds)
                  await new Promise(r => setTimeout(r, 5000))
                  // Re-test all CLIs to check if auth succeeded
                  autoTestedRef.current.clear()
                  setClaudeAuthStatus('unknown')
                  setGeminiAuthStatus('unknown')
                  setCodexAuthStatus('unknown')
                  queryClient.invalidateQueries({ queryKey: ['claudeCLIStatus'] })
                  queryClient.invalidateQueries({ queryKey: ['geminiCLIStatus'] })
                  queryClient.invalidateQueries({ queryKey: ['codexCLIStatus'] })
                } else {
                  toast({ title: t('llm.authCodeFailed', 'Auth code failed'), description: response.data.message, variant: 'destructive' })
                }
              } catch (e) {
                toast({ title: t('llm.authCodeFailed', 'Auth code failed'), description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' })
              }
            }}
            onNativeLogout={(isElectronApp || isLocalMode) ? async (tool) => {
              await nativeLogout(tool)
              // Reset auth status to allow re-test
              if (tool === 'claude_code') {
                autoTestedRef.current.delete('claude_code')
                setClaudeAuthStatus('unknown')
              } else if (tool === 'gemini_cli') {
                autoTestedRef.current.delete('gemini_cli')
                setGeminiAuthStatus('unknown')
              } else if (tool === 'codex_cli') {
                autoTestedRef.current.delete('codex_cli')
                setCodexAuthStatus('unknown')
              }
            } : undefined}
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
            isElectronApp={isElectronApp}
            isLocalMode={isLocalMode ?? false}
            providerAuthStatuses={apiAuthStatuses}
            providerAuthMessages={apiAuthMessages}
            checkingAuthProviders={checkingAuthProviders}
            savingKeyProvider={savingKeyProvider}
            onSaveKey={(id, key) => saveAPIKeyMutation.mutate({ providerId: id, apiKey: key })}
            onTest={handleTestProvider}
            onRefresh={handleRefreshAPIAuth}
            onSelectProvider={handleSelectProvider}
            onModelChange={handleModelChange}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
