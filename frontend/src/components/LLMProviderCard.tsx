import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check,
  ExternalLink,
  Loader2,
  Star,
  Play,
  RefreshCw,
  KeyRound,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { getModelDisplayName } from '@/lib/model-display'
import { getProviderIcon } from './icons/LLMIcons'
import type { LLMProvider } from '@/api/llm'
import { LLM_PROVIDERS } from '@/constants'

// API key management URLs per provider
const PROVIDER_KEY_URLS: Record<string, string> = {
  [LLM_PROVIDERS.OPENAI]: 'https://platform.openai.com/api-keys',
  [LLM_PROVIDERS.ANTHROPIC]: 'https://console.anthropic.com/settings/keys',
  [LLM_PROVIDERS.GEMINI]: 'https://aistudio.google.com/apikey',
}

interface LLMProviderCardProps {
  provider: LLMProvider
  isSelected: boolean
  onSelect: (providerId: string) => void
  onModelChange: (providerId: string, model: string) => Promise<void>
  isUpdating: boolean
  readOnly?: boolean
  authStatus?: 'authenticated' | 'auth_failed' | 'unknown'
  authMessage?: string
  isCheckingAuth?: boolean
  isSavingKey?: boolean
  isTesting?: boolean
  onSaveKey?: (apiKey: string) => void
  onTest?: () => void
  onRefresh?: () => void
}

export function LLMProviderCard({
  provider,
  isSelected,
  onSelect,
  onModelChange,
  isUpdating,
  readOnly = false,
  authStatus,
  authMessage,
  isCheckingAuth,
  isSavingKey,
  isTesting,
  onSaveKey,
  onTest,
  onRefresh,
}: LLMProviderCardProps) {
  const { t } = useTranslation(['settings'])
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')

  const handleSelect = () => {
    onSelect(provider.id)
  }

  const handleModelChange = async (model: string) => {
    await onModelChange(provider.id, model)
  }

  // Auth status badge (same pattern as CLIStatusCard)
  const getAuthBadge = () => {
    if (isCheckingAuth) {
      return (
        <Badge variant="secondary">
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
          {t('settings:cli.checking')}
        </Badge>
      )
    }
    if (authStatus === 'authenticated') {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          {t('settings:llm.configured')}
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t('settings:llm.notConfigured')}
      </Badge>
    )
  }

  // Key button: color-coded by auth status (same pattern as CLIStatusCard)
  const getKeyButton = () => {
    if (readOnly || !onSaveKey) return null

    if (isCheckingAuth) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" disabled>
                <Loader2 className="h-4 w-4 animate-spin" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('settings:cli.checking', 'Checking...')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    const keyColorClass =
      authStatus === 'authenticated'
        ? 'text-green-600 hover:text-green-700 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/30'
        : authStatus === 'auth_failed'
          ? 'text-red-500 hover:text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30'
          : 'text-muted-foreground hover:text-foreground'

    const keyTooltip =
      authStatus === 'authenticated'
        ? t('settings:cli.connected', 'Connected')
        : authStatus === 'auth_failed'
          ? (authMessage || t('settings:cli.enterApiKey', 'Enter API key'))
          : t('settings:cli.authUnknown', 'Not tested')

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-8 w-8', keyColorClass)}
              onClick={() => setShowKeyInput(!showKeyInput)}
              disabled={isSavingKey || isTesting || isUpdating}
            >
              {isSavingKey ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{keyTooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-4 space-y-4 transition-all',
        isSelected && 'border-primary bg-primary/5 ring-1 ring-primary'
      )}
    >
      {/* Header */}
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
        <div className="flex items-center gap-1">
          {getAuthBadge()}
          {getKeyButton()}
          {/* Test button */}
          {onTest && (readOnly ? provider.configured : true) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onTest}
                    disabled={isTesting || isUpdating}
                  >
                    {isTesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('settings:llm.test', 'Test')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {/* Refresh button */}
          {!readOnly && onRefresh && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onRefresh}
                    disabled={isCheckingAuth || isUpdating}
                  >
                    <RefreshCw className={cn('h-4 w-4', isCheckingAuth && 'animate-spin')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('settings:llm.refresh', 'Refresh')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {/* Get API Key link - hidden in readOnly (dev/prod) mode */}
          {!readOnly && PROVIDER_KEY_URLS[provider.id] && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs text-muted-foreground"
              onClick={() => window.open(PROVIDER_KEY_URLS[provider.id], '_blank')}
            >
              {t('settings:llm.getApiKey')}
              <ExternalLink className="ml-1 h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Inline API key input (same pattern as CLIStatusCard) */}
      {showKeyInput && onSaveKey && (
        <div className="flex items-center gap-2">
          <Input
            type="password"
            placeholder={t('settings:cli.enterApiKey', 'Enter API key')}
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            className="h-8 text-xs flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && apiKeyInput.trim()) {
                onSaveKey(apiKeyInput)
                setApiKeyInput('')
                setShowKeyInput(false)
              }
              if (e.key === 'Escape') {
                setShowKeyInput(false)
                setApiKeyInput('')
              }
            }}
          />
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              onSaveKey(apiKeyInput)
              setApiKeyInput('')
              setShowKeyInput(false)
            }}
            disabled={isSavingKey || !apiKeyInput.trim()}
          >
            {isSavingKey ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              t('settings:cli.save', 'Save')
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setShowKeyInput(false)
              setApiKeyInput('')
            }}
          >
            {t('settings:cli.cancel', 'Cancel')}
          </Button>
        </div>
      )}

      {/* Model Selection */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">
          {t('settings:llm.model')}
        </label>
        <Select
          value={provider.models.includes(provider.selected_model) ? provider.selected_model : provider.default_model}
          onValueChange={handleModelChange}
          disabled={isUpdating}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('settings:llm.selectModel')} />
          </SelectTrigger>
          <SelectContent>
            {provider.models.map((model) => (
              <SelectItem key={model} value={model}>
                {getModelDisplayName(model)}
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
    </div>
  )
}
