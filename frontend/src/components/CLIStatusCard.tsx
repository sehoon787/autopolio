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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ClaudeCodeIcon, GeminiIcon } from './icons/LLMIcons'
import type { CLIStatus } from '@/api/llm'

// CLI display configuration
const CLI_CONFIG: Record<string, { name: string; docsUrl: string; changelogUrl: string }> = {
  claude_code: {
    name: 'Claude Code CLI',
    docsUrl: 'https://claude.ai/code',
    changelogUrl: 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md',
  },
  gemini_cli: {
    name: 'Gemini CLI',
    docsUrl: 'https://ai.google.dev/gemini-cli',
    changelogUrl: 'https://github.com/google-gemini/gemini-cli/releases',
  },
}

interface CLIStatusCardProps {
  cliType: 'claude_code' | 'gemini_cli'  // Explicit CLI type for loading state
  status: CLIStatus | null
  isLoading: boolean
  isSelected: boolean
  onRefresh: () => void
  onSelect: () => void
  onTest?: () => void
  isTesting?: boolean
}

type StatusType = 'installed' | 'outdated' | 'not-found' | 'loading'

export function CLIStatusCard({ cliType, status, isLoading, isSelected, onRefresh, onSelect, onTest, isTesting }: CLIStatusCardProps) {
  const { t } = useTranslation(['settings'])
  const [copied, setCopied] = useState(false)

  // Get CLI config based on explicit cliType prop (not status.tool) to handle loading state
  const cliConfig = CLI_CONFIG[cliType]

  // Get the appropriate icon based on CLI type with brand colors
  const getCliIcon = () => {
    if (cliType === 'gemini_cli') {
      return <GeminiIcon className="h-5 w-5" size={20} colored />
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

  const getStatusBadge = () => {
    switch (statusType) {
      case 'installed':
        return (
          <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            {t('settings:cli.installed')}
          </Badge>
        )
      case 'outdated':
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            {t('settings:cli.outdated')}
          </Badge>
        )
      case 'not-found':
        return (
          <Badge variant="destructive">
            {t('settings:cli.notInstalled')}
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary">
            {t('settings:cli.checking')}
          </Badge>
        )
    }
  }

  const copyInstallCommand = async () => {
    if (status?.install_command) {
      await navigator.clipboard.writeText(status.install_command)
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
      {/* Header - Clickable for selection */}
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
            {/* Status indicator */}
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background',
                getStatusColor()
              )}
            />
            {/* Selection checkmark */}
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
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          {/* Test Button */}
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
        </div>
      </div>

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

      {/* Installation Command (when not installed or outdated) */}
      {status && (statusType === 'not-found' || statusType === 'outdated') && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {statusType === 'outdated'
              ? t('settings:cli.updateCommand')
              : t('settings:cli.installCommand')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted p-2 rounded-md font-mono overflow-x-auto">
              {status.install_command}
            </code>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={copyInstallCommand}
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
