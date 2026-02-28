import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { LLMProviderCard } from '@/components/LLMProviderCard'
import type { LLMProvider } from '@/api/llm'

interface APITabProps {
  providers: LLMProvider[]
  selectedLLMProvider: string
  testingProvider: string | null
  isLoadingConfig: boolean
  isConfigError: boolean
  isUpdating: boolean
  isElectronApp: boolean
  isLocalMode: boolean
  providerAuthStatuses: Record<string, 'authenticated' | 'auth_failed' | 'unknown'>
  providerAuthMessages: Record<string, string>
  checkingAuthProviders: Set<string>
  savingKeyProvider: string | null
  onSaveKey: (providerId: string, apiKey: string) => void
  onTest: (providerId: string) => void
  onRefresh: (providerId: string) => void
  onSelectProvider: (providerId: string) => void
  onModelChange: (providerId: string, model: string) => Promise<void>
}

export function APITab({
  providers,
  selectedLLMProvider,
  testingProvider,
  isLoadingConfig,
  isConfigError,
  isUpdating,
  isElectronApp,
  isLocalMode,
  providerAuthStatuses,
  providerAuthMessages,
  checkingAuthProviders,
  savingKeyProvider,
  onSaveKey,
  onTest,
  onRefresh,
  onSelectProvider,
  onModelChange,
}: APITabProps) {
  const { t } = useTranslation('settings')

  const isEditable = isElectronApp || isLocalMode
  const visibleProviders = isEditable
    ? providers
    : providers.filter((p) => p.env_configured)
  // Key management (key icon, Get API Key link) in Electron + local mode
  const showKeyManagement = isElectronApp || isLocalMode

  return (
    <div className="space-y-4">
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
      ) : visibleProviders.length === 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('llm.noProviders', 'No API providers are configured. Set API keys in the server .env file, or use Local mode to configure them in the browser.')}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-3">
          {visibleProviders.map((provider) => (
            <LLMProviderCard
              key={provider.id}
              provider={provider}
              isSelected={selectedLLMProvider === provider.id}
              readOnly={!showKeyManagement}
              authStatus={providerAuthStatuses[provider.id] || 'unknown'}
              authMessage={providerAuthMessages[provider.id]}
              isCheckingAuth={checkingAuthProviders.has(provider.id)}
              isSavingKey={savingKeyProvider === provider.id}
              isTesting={testingProvider === provider.id}
              onSaveKey={showKeyManagement ? (apiKey) => onSaveKey(provider.id, apiKey) : undefined}
              onTest={() => onTest(provider.id)}
              onRefresh={showKeyManagement ? () => onRefresh(provider.id) : undefined}
              onSelect={onSelectProvider}
              onModelChange={onModelChange}
              isUpdating={isUpdating}
            />
          ))}
        </div>
      )}
    </div>
  )
}
