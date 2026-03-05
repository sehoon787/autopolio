import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check,
  AlertTriangle,
  X,
  RefreshCw,
  ExternalLink,
  Copy,
  FolderOpen,
  Play,
  Loader2,
  KeyRound,
  LogIn,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { getModelDisplayName } from '@/lib/model-display'
import { ClaudeCodeIcon, GeminiIcon, OpenAIIcon } from './icons/LLMIcons'
import type { CLIStatus } from '@/api/llm'
import { CLI_TYPES, type CLIType } from '@/constants'

// CLI display configuration
const CLI_CONFIG: Record<string, { name: string; docsUrl: string; changelogUrl: string; authUrl: string }> = {
  [CLI_TYPES.CLAUDE_CODE]: {
    name: 'Claude Code CLI',
    docsUrl: 'https://claude.ai/code',
    changelogUrl: 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md',
    authUrl: 'https://console.anthropic.com/settings/keys',
  },
  [CLI_TYPES.GEMINI_CLI]: {
    name: 'Gemini CLI',
    docsUrl: 'https://ai.google.dev/gemini-cli',
    changelogUrl: 'https://github.com/google-gemini/gemini-cli/releases',
    authUrl: 'https://aistudio.google.com/apikey',
  },
  [CLI_TYPES.CODEX_CLI]: {
    name: 'Codex CLI',
    docsUrl: 'https://github.com/openai/codex',
    changelogUrl: 'https://github.com/openai/codex/releases',
    authUrl: 'https://platform.openai.com/api-keys',
  },
}

interface CLIStatusCardProps {
  cliType: CLIType
  status: CLIStatus | null
  isLoading: boolean
  isSelected: boolean
  onRefresh: () => void
  onSelect: () => void
  onTest?: () => void
  isTesting?: boolean
  models?: readonly string[]
  selectedModel?: string
  onModelChange?: (model: string) => void
  authStatus?: 'authenticated' | 'auth_failed' | 'unknown'
  authMessage?: string
  isCheckingAuth?: boolean
  isSavingKey?: boolean
  onSaveKey?: (apiKey: string) => void
  // Native login props (Electron only, Claude Code & Gemini CLI)
  supportsNativeLogin?: boolean
  isNativeLoggingIn?: boolean
  loginUrl?: string | null
  nativeAuthEmail?: string | null
  onNativeLogin?: () => void
  onCancelNativeLogin?: () => void
  onNativeLogout?: () => void
  onSubmitAuthCode?: (code: string) => void
}

type StatusType = 'installed' | 'outdated' | 'not-found' | 'loading'

export function CLIStatusCard({ cliType, status, isLoading, isSelected, onRefresh, onSelect, onTest, isTesting, models, selectedModel, onModelChange, authStatus, authMessage, isCheckingAuth, isSavingKey, onSaveKey, supportsNativeLogin, isNativeLoggingIn, loginUrl, nativeAuthEmail, onNativeLogin, onCancelNativeLogin, onSubmitAuthCode }: CLIStatusCardProps) {
  const { t } = useTranslation(['settings'])
  const [copied, setCopied] = useState(false)
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [authCodeInput, setAuthCodeInput] = useState('')

  const cliConfig = CLI_CONFIG[cliType]

  const getCliIcon = () => {
    if (cliType === CLI_TYPES.GEMINI_CLI) {
      return <GeminiIcon className="h-5 w-5" size={20} colored />
    }
    if (cliType === CLI_TYPES.CODEX_CLI) {
      return <OpenAIIcon className="h-5 w-5" size={20} colored />
    }
    return <ClaudeCodeIcon className="h-5 w-5" size={20} colored />
  }

  const getStatusType = (): StatusType => {
    if (isLoading || !status) return 'loading'
    if (!status.installed) return 'not-found'
    if (status.is_outdated) return 'outdated'
    return 'installed'
  }

  const statusType = getStatusType()

  const getStatusColor = () => {
    switch (statusType) {
      case 'installed':
        return 'bg-green-500'
      case 'outdated':
        return 'bg-yellow-500'
      case 'not-found':
        return 'bg-destructive'
      default:
        return 'bg-muted-foreground'
    }
  }

  const getStatusIcon = () => {
    switch (statusType) {
      case 'installed':
        return <Check className="h-4 w-4 text-green-600" />
      case 'outdated':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case 'not-found':
        return <X className="h-4 w-4 text-destructive" />
      default:
        return <RefreshCw className="h-4 w-4 animate-spin" />
    }
  }

  // Auth status badge: 연결됨 / 연결 안됨
  const getAuthBadge = () => {
    // Still loading CLI status — don't show badge yet
    if (isLoading || !status) {
      return null
    }
    if (!status.installed) {
      return (
        <Badge variant="destructive">
          {t('settings:cli.notInstalled')}
        </Badge>
      )
    }
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
    // unknown = not yet tested (autoTest will run) — show checking spinner
    if (authStatus === 'unknown') {
      return (
        <Badge variant="secondary">
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
          {t('settings:cli.checking')}
        </Badge>
      )
    }
    // auth_failed = tested and failed
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t('settings:llm.notConfigured')}
      </Badge>
    )
  }

  // Key button: color-coded by auth status (green=key valid, red=no key/invalid, spinner=checking)
  const getKeyButton = () => {
    if (!status?.installed || !onSaveKey) return null

    // Checking auth — show spinner
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
              disabled={isSavingKey || isTesting || isLoading}
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

  // Native login button (Claude Code, Gemini CLI only)
  const getNativeLoginButton = () => {
    if (!supportsNativeLogin || !status?.installed) return null

    // Currently logging in
    if (isNativeLoggingIn) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-blue-500"
                onClick={onCancelNativeLogin}
              >
                <Loader2 className="h-4 w-4 animate-spin" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('settings:cli.loggingIn', 'Logging in...')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    // Single login button — works as login or re-login depending on state
    const isAuthenticated = !!(nativeAuthEmail || authStatus === 'authenticated')
    const tooltip = isAuthenticated
      ? t('settings:cli.reLogin', 'Re-login')
      : t('settings:cli.login', 'Login')

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8',
                isAuthenticated
                  ? 'text-green-600 hover:text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                  : 'text-blue-500 hover:text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30'
              )}
              onClick={onNativeLogin}
              disabled={isLoading || isTesting}
            >
              <LogIn className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  const copyCommand = async () => {
    const command = statusType === 'outdated' && status?.update_command
      ? status.update_command
      : status?.install_command
    if (command) {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
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
          onClick={onSelect}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onSelect()}
        >
          <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            {getCliIcon()}
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background',
                getStatusColor()
              )}
            />
            {isSelected && (
              <span className="absolute -top-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" />
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium">{cliConfig.name}</h4>
              {isSelected && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  {t('settings:cli.selected')}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {getStatusIcon()}
              <span>
                {statusType === 'installed' && t('settings:cli.installed')}
                {statusType === 'outdated' && t('settings:cli.outdated')}
                {statusType === 'not-found' && t('settings:cli.notInstalled')}
                {statusType === 'loading' && t('settings:cli.checking')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {getAuthBadge()}
          {/* Native login button (Claude Code, Gemini CLI) */}
          {getNativeLoginButton()}
          {/* API Key management */}
          {getKeyButton()}
          {/* Test button */}
          {onTest && status?.installed && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onTest}
                    disabled={isTesting || isLoading}
                  >
                    {isTesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('settings:cli.test', 'Test')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {/* Refresh button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onRefresh}
                  disabled={isLoading}
                >
                  <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('settings:cli.refresh')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {/* Get API Key link - only when key management is available */}
          {onSaveKey && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs text-muted-foreground"
              onClick={() => window.open(cliConfig.authUrl, '_blank')}
            >
              {t('settings:llm.getApiKey')}
              <ExternalLink className="ml-1 h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Inline API key input (separate from connect/disconnect) */}
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

      {/* Native login in progress */}
      {isNativeLoggingIn && loginUrl && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {t('settings:cli.loggingIn', 'Logging in...')}
              </p>
              <a
                href={loginUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline truncate block"
              >
                {t('settings:cli.openLoginPage', 'Open login page')}
                <ExternalLink className="inline-block ml-1 h-3 w-3" />
              </a>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs shrink-0"
              onClick={onCancelNativeLogin}
            >
              {t('settings:cli.cancel', 'Cancel')}
            </Button>
          </div>
          {/* Auth code input for CLI OAuth code-paste flow */}
          {onSubmitAuthCode && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={authCodeInput}
                onChange={(e) => setAuthCodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && authCodeInput.trim()) {
                    onSubmitAuthCode(authCodeInput.trim())
                    setAuthCodeInput('')
                  }
                }}
                placeholder={t('settings:cli.pasteAuthCode', 'Paste auth code here')}
                className="flex-1 h-7 px-2 text-xs border rounded bg-white dark:bg-gray-800"
              />
              <Button
                variant="default"
                size="sm"
                className="h-7 text-xs shrink-0"
                disabled={!authCodeInput.trim()}
                onClick={() => {
                  onSubmitAuthCode(authCodeInput.trim())
                  setAuthCodeInput('')
                }}
              >
                {t('settings:cli.submit', 'Submit')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Native auth account info */}
      {nativeAuthEmail && !isNativeLoggingIn && (
        <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-md">
          <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
          <span className="text-xs text-green-700 dark:text-green-300 truncate">
            {t('settings:cli.loggedInAs', { account: nativeAuthEmail, defaultValue: `Logged in as ${nativeAuthEmail}` })}
          </span>
        </div>
      )}

      {/* Version Info */}
      {status && !isLoading && (
        <div className="text-xs space-y-2 p-3 bg-muted rounded-md">
          {status.version && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('settings:cli.version')}:</span>
              <span className="font-mono">{status.version}</span>
            </div>
          )}
          {status.latest_version && status.latest_version !== 'unknown' && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('settings:cli.latestVersion')}:</span>
              <span className="font-mono">{status.latest_version}</span>
            </div>
          )}
          {status.path && (
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground flex items-center gap-1">
                <FolderOpen className="h-3 w-3" />
                {t('settings:cli.path')}:
              </span>
              <span
                className="font-mono text-[10px] truncate max-w-[200px]"
                title={status.path}
              >
                {status.path}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Model Selection (when installed) */}
      {status?.installed && models && models.length > 0 && onModelChange && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            {t('settings:cli.model', 'Model')}
          </label>
          <Select
            value={selectedModel && models.includes(selectedModel) ? selectedModel : models[0]}
            onValueChange={onModelChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model} value={model}>
                  {getModelDisplayName(model)}
                  {model === models[0] && (
                    <span className="ml-2 text-muted-foreground text-xs">
                      ({t('settings:llm.default', 'default')})
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Installation/Update Command (when not installed or outdated) */}
      {status && (statusType === 'not-found' || statusType === 'outdated') && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {statusType === 'outdated'
              ? t('settings:cli.updateCommand')
              : t('settings:cli.installCommand')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted p-2 rounded-md font-mono overflow-x-auto">
              {statusType === 'outdated' && status.update_command
                ? status.update_command
                : status.install_command}
            </code>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={copyCommand}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {copied ? t('settings:cli.copied') : t('settings:cli.copy')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}

      {/* Links */}
      <div className="flex gap-2 pt-2">
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs text-muted-foreground"
          onClick={() => window.open(cliConfig.docsUrl, '_blank')}
        >
          {t('settings:cli.learnMore')}
          <ExternalLink className="ml-1 h-3 w-3" />
        </Button>
        <span className="text-muted-foreground">|</span>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs text-muted-foreground"
          onClick={() => window.open(cliConfig.changelogUrl, '_blank')}
        >
          {t('settings:cli.viewChangelog')}
          <ExternalLink className="ml-1 h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}
