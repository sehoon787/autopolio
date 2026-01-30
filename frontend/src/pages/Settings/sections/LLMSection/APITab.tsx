import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { LLMProviderCard } from '@/components/LLMProviderCard'
import type { LLMProvider, APIKeyValidationResponse } from '@/api/llm'

interface APITabProps {
  providers: LLMProvider[]
  selectedLLMProvider: string
  testingProvider: string | null
  isLoadingConfig: boolean
  isConfigError: boolean
  isUpdating: boolean
  getStoredKeyForProvider: (providerId: string) => string | null
  onSaveKey: (providerId: string, apiKey: string) => Promise<void>
  onValidateKey: (providerId: string, apiKey: string) => Promise<APIKeyValidationResponse>
  onTestKey: (providerId: string, apiKey: string) => Promise<{ success: boolean; response: string }>
  onSelectProvider: (providerId: string) => void
  onModelChange: (providerId: string, model: string) => Promise<void>
  onTestStored: (providerId: string) => void
}

export function APITab({
  providers,
  selectedLLMProvider,
  testingProvider,
  isLoadingConfig,
  isConfigError,
  isUpdating,
  getStoredKeyForProvider,
  onSaveKey,
  onValidateKey,
  onTestKey,
  onSelectProvider,
  onModelChange,
  onTestStored,
}: APITabProps) {
  const { t } = useTranslation('settings')

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
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => (
            <LLMProviderCard
              key={provider.id}
              provider={provider}
              isSelected={selectedLLMProvider === provider.id}
              storedKey={getStoredKeyForProvider(provider.id)}
              onSaveKey={onSaveKey}
              onValidateKey={onValidateKey}
              onTestKey={onTestKey}
              onSelect={onSelectProvider}
              onModelChange={onModelChange}
              onTestStored={() => onTestStored(provider.id)}
              isTesting={testingProvider === provider.id}
              isUpdating={isUpdating}
            />
          ))}
        </div>
      )}
    </div>
  )
}
