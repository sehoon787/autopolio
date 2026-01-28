import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check,
  X,
  Eye,
  EyeOff,
  Loader2,
  Star,
  Play,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { getProviderIcon } from './icons/LLMIcons'
import type { LLMProvider } from '@/api/llm'
import { useUsageStore } from '@/stores/usageStore'
import type { LLMUsage } from '@/stores/usageStore'

interface LLMProviderCardProps {
  provider: LLMProvider
  isSelected: boolean
  storedKey?: string | null  // Pre-loaded stored API key (decrypted)
  onSaveKey: (providerId: string, apiKey: string) => Promise<void>
  onValidateKey: (providerId: string, apiKey: string) => Promise<{ valid: boolean; error?: string | null }>
  onTestKey: (providerId: string, apiKey: string) => Promise<{ success: boolean; response: string }>
  onSelect: (providerId: string) => void
  onModelChange: (providerId: string, model: string) => Promise<void>
  onTestStored?: () => void  // Test with stored key (for configured providers)
  isTesting?: boolean
  isUpdating: boolean
  readOnly?: boolean  // Web mode: hide API key input, only show selection and test
}

type OperationStatus = 'idle' | 'validating' | 'testing' | 'saving'
type ResultType = 'success' | 'error' | 'info'

interface OperationResult {
  type: ResultType
  message: string
}

export function LLMProviderCard({
  provider,
  isSelected,
  storedKey,
  onSaveKey,
  onValidateKey,
  onTestKey,
  onSelect,
  onModelChange,
  onTestStored,
  isTesting,
  isUpdating,
  readOnly = false,
}: LLMProviderCardProps) {
  const { t } = useTranslation(['settings'])
  const [apiKey, setApiKey] = useState(storedKey || '')
  const [showKey, setShowKey] = useState(false)
  const [status, setStatus] = useState<OperationStatus>('idle')
  const [result, setResult] = useState<OperationResult | null>(null)

  // Update apiKey when storedKey changes (e.g., after initial fetch)
  useEffect(() => {
    if (storedKey && !apiKey) {
      setApiKey(storedKey)
    }
  }, [storedKey])

  const isProcessing = status !== 'idle'
  const hasKey = apiKey.trim().length > 0

  // Validate only
  const handleValidate = async () => {
    if (!apiKey.trim()) return

    setStatus('validating')
    setResult(null)

    try {
      const validationResult = await onValidateKey(provider.id, apiKey)
      if (validationResult.valid) {
        setResult({ type: 'success', message: t('settings:llm.valid') })
      } else {
        setResult({ type: 'error', message: validationResult.error || t('settings:llm.invalid') })
      }
    } catch (error) {
      setResult({ type: 'error', message: t('settings:llm.validationFailed', 'Validation failed') })
    } finally {
      setStatus('idle')
    }
  }

  // Test: Validate first, then test with the input API key
  const handleTest = async () => {
    if (!apiKey.trim()) return

    console.log('[LLM Card Test] handleTest called:', { providerId: provider.id, hasKey: !!apiKey.trim() })
    setStatus('validating')
    setResult({ type: 'info', message: t('settings:llm.validating', 'Validating...') })

    try {
      // Step 1: Validate
      const validationResult = await onValidateKey(provider.id, apiKey)
      console.log('[LLM Card Test] Validation result:', validationResult)
      if (!validationResult.valid) {
        setResult({ type: 'error', message: validationResult.error || t('settings:llm.invalid') })
        setStatus('idle')
        return
      }

      // Step 2: Test
      setStatus('testing')
      setResult({ type: 'info', message: t('settings:llm.testing', 'Testing...') })

      const testResult = await onTestKey(provider.id, apiKey)
      console.log('[LLM Card Test] Test result:', { success: testResult.success, response: testResult.response?.substring(0, 100) })
      if (testResult.success) {
        setResult({ type: 'success', message: testResult.response })
      } else {
        setResult({ type: 'error', message: testResult.response })
      }
    } catch (error) {
      console.log('[LLM Card Test] Error:', error)
      setResult({ type: 'error', message: t('settings:llm.testFailed', 'Test failed') })
    } finally {
      setStatus('idle')
    }
  }

  // Save: Validate + Test + Save
  const handleSave = async () => {
    if (!apiKey.trim()) return

    setStatus('validating')
    setResult({ type: 'info', message: t('settings:llm.validating', 'Validating...') })

    try {
      // Step 1: Validate
      const validationResult = await onValidateKey(provider.id, apiKey)
      if (!validationResult.valid) {
        setResult({ type: 'error', message: validationResult.error || t('settings:llm.invalid') })
        setStatus('idle')
        return
      }

      // Step 2: Test
      setStatus('testing')
      setResult({ type: 'info', message: t('settings:llm.testing', 'Testing...') })

      const testResult = await onTestKey(provider.id, apiKey)
      if (!testResult.success) {
        setResult({ type: 'error', message: testResult.response })
        setStatus('idle')
        return
      }

      // Step 3: Save
      setStatus('saving')
      setResult({ type: 'info', message: t('settings:llm.saving', 'Saving...') })

      await onSaveKey(provider.id, apiKey)
      // Keep the API key in the input field after successful save
      setResult({ type: 'success', message: t('settings:llm.saved', 'Saved successfully!') })
    } catch (error) {
      setResult({ type: 'error', message: t('settings:llm.saveFailed', 'Save failed') })
    } finally {
      setStatus('idle')
    }
  }

  const handleClear = async () => {
    setStatus('saving')
    setResult(null)
    try {
      await onSaveKey(provider.id, '')
      setApiKey('')
      // Reset usage counters for this provider
      const providerKey = provider.id as keyof LLMUsage
      if (['openai', 'anthropic', 'gemini'].includes(provider.id)) {
        useUsageStore.getState().resetProviderUsage(providerKey)
      }
      setResult({ type: 'success', message: t('settings:llm.cleared', 'API key cleared') })
    } catch (error) {
      setResult({ type: 'error', message: t('settings:llm.clearFailed', 'Failed to clear') })
    } finally {
      setStatus('idle')
    }
  }

  const handleModelChange = async (model: string) => {
    await onModelChange(provider.id, model)
  }

  const handleSelect = () => {
    onSelect(provider.id)
  }

  const getResultClassName = () => {
    if (!result) return ''
    switch (result.type) {
      case 'success':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      case 'error':
        return 'bg-destructive/10 text-destructive'
      case 'info':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-4 space-y-4 transition-all',
        isSelected && 'border-primary bg-primary/5 ring-1 ring-primary'
      )}
    >
      {/* Header - Clickable for selection */}
      <div className="flex items-center justify-between">
        <div
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={handleSelect}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleSelect()}
        >
          <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            {getProviderIcon(provider.id, { size: 20, className: 'text-foreground' })}
            {/* Selection checkmark */}
            {isSelected && (
              <span className="absolute -top-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" />
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium">{provider.name}</h4>
              {isSelected && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  <Star className="h-3 w-3 mr-1" />
                  {t('settings:llm.selected')}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{provider.description}</p>
          </div>
        </div>
        <Badge variant={provider.configured ? 'secondary' : 'outline'}>
          {provider.configured
            ? t('settings:llm.configured')
            : t('settings:llm.notConfigured')}
        </Badge>
      </div>

      {/* API Key Input - hidden in readOnly mode */}
      {!readOnly && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            {t('settings:llm.apiKey')}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? 'text' : 'password'}
                placeholder={
                  provider.configured
                    ? t('settings:llm.keyConfigured')
                    : t('settings:llm.enterKey')
                }
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setResult(null)
                }}
                className="pr-10 font-mono text-sm"
                disabled={isProcessing}
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full w-10"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleValidate}
              disabled={!hasKey || isProcessing}
            >
              {status === 'validating' && !result?.message.includes('Testing') && !result?.message.includes('Saving') ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('settings:llm.validate')
              )}
            </Button>
          </div>

          {/* Result Message */}
          {result && (
            <div
              className={cn(
                'flex items-center gap-2 text-xs p-2 rounded-md',
                getResultClassName()
              )}
            >
              {result.type === 'success' && <Check className="h-3 w-3 flex-shrink-0" />}
              {result.type === 'error' && <X className="h-3 w-3 flex-shrink-0" />}
              {result.type === 'info' && <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />}
              <span className="break-all">{result.message}</span>
            </div>
          )}
        </div>
      )}

      {/* Model Selection */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">
          {t('settings:llm.model')}
        </label>
        <Select
          value={provider.selected_model}
          onValueChange={handleModelChange}
          disabled={isUpdating || isProcessing}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('settings:llm.selectModel')} />
          </SelectTrigger>
          <SelectContent>
            {provider.models.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
                {model === provider.default_model && (
                  <span className="ml-2 text-muted-foreground text-xs">
                    ({t('settings:llm.default')})
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 flex-wrap">
        {/* Test/Save buttons for input key - hidden in readOnly mode */}
        {!readOnly && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={!hasKey || isProcessing || isUpdating}
            >
              {status === 'testing' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              {t('settings:llm.test', 'Test')}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!hasKey || isProcessing || isUpdating}
            >
              {status === 'saving' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              {t('settings:llm.save')}
            </Button>
            {provider.configured && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={isProcessing || isUpdating}
              >
                {t('settings:llm.clear')}
              </Button>
            )}
          </>
        )}
        {/* Test Stored Key Button - shown when provider is configured (for readOnly mode) */}
        {readOnly && onTestStored && provider.configured && (
          <Button
            variant="outline"
            size="sm"
            onClick={onTestStored}
            disabled={isTesting || isUpdating}
          >
            {isTesting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Play className="h-4 w-4 mr-1" />
            )}
            {t('settings:llm.test', 'Test')}
          </Button>
        )}
      </div>
    </div>
  )
}
