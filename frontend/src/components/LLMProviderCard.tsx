import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check,
  X,
  Eye,
  EyeOff,
  Loader2,
  Star,
  Play,
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

interface LLMProviderCardProps {
  provider: LLMProvider
  isSelected: boolean
  onSaveKey: (providerId: string, apiKey: string) => Promise<void>
  onValidateKey: (providerId: string, apiKey: string) => Promise<{ valid: boolean; error?: string | null }>
  onSelect: (providerId: string) => void
  onModelChange: (providerId: string, model: string) => Promise<void>
  onTest?: () => void
  isTesting?: boolean
  isUpdating: boolean
}

export function LLMProviderCard({
  provider,
  isSelected,
  onSaveKey,
  onValidateKey,
  onSelect,
  onModelChange,
  onTest,
  isTesting,
  isUpdating,
}: LLMProviderCardProps) {
  const { t } = useTranslation(['settings'])
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [validationResult, setValidationResult] = useState<{
    valid: boolean
    error?: string | null
  } | null>(null)

  const handleValidate = async () => {
    if (!apiKey.trim()) return

    setIsValidating(true)
    setValidationResult(null)

    try {
      const result = await onValidateKey(provider.id, apiKey)
      setValidationResult(result)
    } catch (error) {
      setValidationResult({ valid: false, error: 'Validation failed' })
    } finally {
      setIsValidating(false)
    }
  }

  const handleSave = async () => {
    if (!apiKey.trim()) return

    setIsSaving(true)
    try {
      await onSaveKey(provider.id, apiKey)
      setApiKey('')
      setValidationResult(null)
    } finally {
      setIsSaving(false)
    }
  }

  const handleClear = async () => {
    setIsSaving(true)
    try {
      await onSaveKey(provider.id, '')
      setApiKey('')
      setValidationResult(null)
    } finally {
      setIsSaving(false)
    }
  }

  const handleModelChange = async (model: string) => {
    await onModelChange(provider.id, model)
  }

  const handleSelect = () => {
    onSelect(provider.id)
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

      {/* API Key Input */}
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
                setValidationResult(null)
              }}
              className="pr-10 font-mono text-sm"
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
            disabled={!apiKey.trim() || isValidating}
          >
            {isValidating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t('settings:llm.validate')
            )}
          </Button>
        </div>

        {/* Validation Result */}
        {validationResult && (
          <div
            className={cn(
              'flex items-center gap-2 text-xs p-2 rounded-md',
              validationResult.valid
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-destructive/10 text-destructive'
            )}
          >
            {validationResult.valid ? (
              <>
                <Check className="h-3 w-3" />
                {t('settings:llm.valid')}
              </>
            ) : (
              <>
                <X className="h-3 w-3" />
                {validationResult.error || t('settings:llm.invalid')}
              </>
            )}
          </div>
        )}
      </div>

      {/* Model Selection */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">
          {t('settings:llm.model')}
        </label>
        <Select
          value={provider.selected_model}
          onValueChange={handleModelChange}
          disabled={isUpdating}
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
      <div className="flex items-center gap-2 pt-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!apiKey.trim() || isSaving || isUpdating}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          {t('settings:llm.save')}
        </Button>
        {provider.configured && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={isSaving || isUpdating}
          >
            {t('settings:llm.clear')}
          </Button>
        )}
        {/* Test Button */}
        {onTest && provider.configured && (
          <Button
            variant="outline"
            size="sm"
            onClick={onTest}
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
