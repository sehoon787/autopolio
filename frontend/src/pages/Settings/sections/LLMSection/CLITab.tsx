import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { CLIStatusCard } from '@/components/CLIStatusCard'
import { CLAUDE_CODE_MODELS, GEMINI_CLI_MODELS } from '@/stores/appStore'
import type { CLIStatus as ElectronCLIStatus } from '@/lib/electron'
import type { CLIStatus as APICLIStatus } from '@/api/llm'

// Accept either electron or API CLI status type
type CLIStatus = ElectronCLIStatus | APICLIStatus

interface CLITabProps {
  claudeCLIStatus: CLIStatus | null
  geminiCLIStatus: CLIStatus | null
  isLoadingClaudeCLI: boolean
  isLoadingGeminiCLI: boolean
  isRefreshingClaudeCLI: boolean
  isRefreshingGeminiCLI: boolean
  isRefreshingAll: boolean
  selectedCLI: 'claude_code' | 'gemini_cli'
  testingCLI: string | null
  claudeCodeModel: string
  geminiCLIModel: string
  onRefreshAll: () => void
  onRefreshClaudeCLI: () => void
  onRefreshGeminiCLI: () => void
  onSelectCLI: (cliType: 'claude_code' | 'gemini_cli') => void
  onTestCLI: (cliType: 'claude_code' | 'gemini_cli') => void
  onClaudeCodeModelChange: (model: string) => void
  onGeminiCLIModelChange: (model: string) => void
}

export function CLITab({
  claudeCLIStatus,
  geminiCLIStatus,
  isLoadingClaudeCLI,
  isLoadingGeminiCLI,
  isRefreshingClaudeCLI,
  isRefreshingGeminiCLI,
  isRefreshingAll,
  selectedCLI,
  testingCLI,
  claudeCodeModel,
  geminiCLIModel,
  onRefreshAll,
  onRefreshClaudeCLI,
  onRefreshGeminiCLI,
  onSelectCLI,
  onTestCLI,
  onClaudeCodeModelChange,
  onGeminiCLIModelChange,
}: CLITabProps) {
  const { t } = useTranslation('settings')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t('llm.cliDescription', 'Use CLI tools for AI-powered code generation. Select one to use.')}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefreshAll}
          disabled={isRefreshingAll}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshingAll ? 'animate-spin' : ''}`} />
          {t('llm.refresh', 'Refresh')}
        </Button>
      </div>

      {isLoadingClaudeCLI && isLoadingGeminiCLI ? (
        <>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </>
      ) : (
        <div className="space-y-3">
          {/* Claude Code CLI */}
          <CLIStatusCard
            cliType="claude_code"
            status={claudeCLIStatus}
            isLoading={isLoadingClaudeCLI || isRefreshingClaudeCLI}
            isSelected={selectedCLI === 'claude_code'}
            onRefresh={onRefreshClaudeCLI}
            onSelect={() => onSelectCLI('claude_code')}
            onTest={() => onTestCLI('claude_code')}
            isTesting={testingCLI === 'claude_code'}
            models={CLAUDE_CODE_MODELS}
            selectedModel={claudeCodeModel}
            onModelChange={onClaudeCodeModelChange}
          />
          {/* Gemini CLI */}
          <CLIStatusCard
            cliType="gemini_cli"
            status={geminiCLIStatus}
            isLoading={isLoadingGeminiCLI || isRefreshingGeminiCLI}
            isSelected={selectedCLI === 'gemini_cli'}
            onRefresh={onRefreshGeminiCLI}
            onSelect={() => onSelectCLI('gemini_cli')}
            onTest={() => onTestCLI('gemini_cli')}
            isTesting={testingCLI === 'gemini_cli'}
            models={GEMINI_CLI_MODELS}
            selectedModel={geminiCLIModel}
            onModelChange={onGeminiCLIModelChange}
          />
        </div>
      )}
    </div>
  )
}
