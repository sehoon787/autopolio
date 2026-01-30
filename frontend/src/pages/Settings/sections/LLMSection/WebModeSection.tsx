import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Info,
  AlertCircle,
  Key,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  ExternalLink,
} from 'lucide-react'
import { LLMProviderCard } from '@/components/LLMProviderCard'
import type { LLMProvider, APIKeyValidationResponse } from '@/api/llm'
import type { TestResult, CurrentSelection } from './types'

interface WebModeSectionProps {
  envConfiguredProviders: LLMProvider[]
  selectedLLMProvider: string
  currentSelection: CurrentSelection
  testResult: TestResult | null
  testingProvider: string | null
  isLoadingConfig: boolean
  isUpdating: boolean
  onSaveKey: (providerId: string, apiKey: string) => Promise<void>
  onValidateKey: (providerId: string, apiKey: string) => Promise<APIKeyValidationResponse>
  onTestKey: (providerId: string, apiKey: string) => Promise<{ success: boolean; response: string }>
  onSelectProvider: (providerId: string) => void
  onModelChange: (providerId: string, model: string) => Promise<void>
  onTestProvider: (providerId: string) => void
  isTestingProvider: boolean
}

export function WebModeSection({
  envConfiguredProviders,
  selectedLLMProvider,
  currentSelection,
  testResult,
  testingProvider,
  isLoadingConfig,
  isUpdating,
  onSaveKey,
  onValidateKey,
  onTestKey,
  onSelectProvider,
  onModelChange,
  onTestProvider,
  isTestingProvider,
}: WebModeSectionProps) {
  const { t } = useTranslation('settings')

  return (
    <div className="space-y-4">
      {/* Info about web mode */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          {t('llm.webModeInfo', 'Server-configured LLM providers are available. Select a provider to use for AI features.')}
        </AlertDescription>
      </Alert>

      {/* Current Selection Summary for Web */}
      {envConfiguredProviders.length > 0 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Key className="h-4 w-4" />
              {t('llm.currentSelection', 'Current Selection')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary">API</Badge>
                <span className="font-medium">{currentSelection.name}</span>
                {'model' in currentSelection && (
                  <span className="text-sm text-muted-foreground">{currentSelection.model}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {'configured' in currentSelection && currentSelection.configured ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-yellow-500" />
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onTestProvider(selectedLLMProvider)}
                  disabled={isTestingProvider}
                >
                  {isTestingProvider ? (
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

      {isLoadingConfig ? (
        <>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </>
      ) : envConfiguredProviders.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('llm.availableProviders', 'Available LLM Providers — click to select')}
          </p>
          {envConfiguredProviders.map((provider) => (
            <LLMProviderCard
              key={provider.id}
              provider={provider}
              isSelected={selectedLLMProvider === provider.id}
              onSaveKey={onSaveKey}
              onValidateKey={onValidateKey}
              onTestKey={onTestKey}
              onSelect={onSelectProvider}
              onModelChange={onModelChange}
              onTestStored={() => onTestProvider(provider.id)}
              isTesting={testingProvider === provider.id}
              isUpdating={isUpdating}
              readOnly={true}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">{t('llm.noProvidersConfigured', 'No LLM Providers Configured')}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t('llm.noProvidersDescription', 'The server administrator has not configured any LLM API keys. Please contact the administrator or use the desktop app.')}
            </p>
            <Button asChild variant="outline">
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
