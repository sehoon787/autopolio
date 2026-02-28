import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { CLIStatusCard } from '@/components/CLIStatusCard'
import { CLAUDE_CODE_MODELS, GEMINI_CLI_MODELS, CODEX_CLI_MODELS } from '@/stores/appStore'
import type { CLIStatus as ElectronCLIStatus } from '@/lib/electron'
import type { CLIStatus as APICLIStatus } from '@/api/llm'

// Accept either electron or API CLI status type
type CLIStatus = ElectronCLIStatus | APICLIStatus

type CLITypeAll = 'claude_code' | 'gemini_cli' | 'codex_cli'

interface CLITabProps {
  claudeCLIStatus: CLIStatus | null
  geminiCLIStatus: CLIStatus | null
  codexCLIStatus: CLIStatus | null
  isLoadingClaudeCLI: boolean
  isLoadingGeminiCLI: boolean
  isLoadingCodexCLI: boolean
  isRefreshingClaudeCLI: boolean
  isRefreshingGeminiCLI: boolean
  isRefreshingCodexCLI: boolean
  isRefreshingAll: boolean
  selectedCLI: CLITypeAll
  testingCLI: string | null
  claudeCodeModel: string
  geminiCLIModel: string
  codexCLIModel: string
  claudeAuthStatus?: 'authenticated' | 'auth_failed' | 'unknown'
  geminiAuthStatus?: 'authenticated' | 'auth_failed' | 'unknown'
  codexAuthStatus?: 'authenticated' | 'auth_failed' | 'unknown'
  claudeAuthMessage?: string
  geminiAuthMessage?: string
  codexAuthMessage?: string
  isCheckingClaudeAuth?: boolean
  isCheckingGeminiAuth?: boolean
  isCheckingCodexAuth?: boolean
  isSavingKey?: boolean
  showAll?: boolean  // true: show connect/key buttons (Electron/Local), false: hide management UI
  onRefreshAll: () => void
  onRefreshClaudeCLI: () => void
  onRefreshGeminiCLI: () => void
  onRefreshCodexCLI: () => void
  onSelectCLI: (cliType: CLITypeAll) => void
  onTestCLI: (cliType: CLITypeAll) => void
  onClaudeCodeModelChange: (model: string) => void
  onGeminiCLIModelChange: (model: string) => void
  onCodexCLIModelChange: (model: string) => void
  onSaveKey?: (cliType: CLITypeAll, apiKey: string) => void
}

export function CLITab({
  claudeCLIStatus,
  geminiCLIStatus,
  codexCLIStatus,
  isLoadingClaudeCLI,
  isLoadingGeminiCLI,
  isLoadingCodexCLI,
  isRefreshingClaudeCLI,
  isRefreshingGeminiCLI,
  isRefreshingCodexCLI,
  isRefreshingAll,
  selectedCLI,
  testingCLI,
  claudeCodeModel,
  geminiCLIModel,
  codexCLIModel,
  claudeAuthStatus,
  geminiAuthStatus,
  codexAuthStatus,
  claudeAuthMessage,
  geminiAuthMessage,
  codexAuthMessage,
  isCheckingClaudeAuth,
  isCheckingGeminiAuth,
  isCheckingCodexAuth,
  isSavingKey,
  onRefreshAll,
  onRefreshClaudeCLI,
  onRefreshGeminiCLI,
  onRefreshCodexCLI,
  onSelectCLI,
  onTestCLI,
  onClaudeCodeModelChange,
  onGeminiCLIModelChange,
  onCodexCLIModelChange,
  onSaveKey,
  showAll = true,
}: CLITabProps) {
  const { t } = useTranslation('settings')

  // Always show all CLI providers (they work in web too)
  const hasVisibleCLI = true

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

      {isLoadingClaudeCLI && isLoadingGeminiCLI && isLoadingCodexCLI ? (
        <>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </>
      ) : !hasVisibleCLI ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('llm.noCLITools', 'No CLI tools are installed. Install Claude Code, Gemini CLI, or Codex CLI to use CLI mode.')}
          </AlertDescription>
        </Alert>
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
            authStatus={claudeAuthStatus}
            authMessage={claudeAuthMessage}
            isCheckingAuth={isCheckingClaudeAuth}
            isSavingKey={isSavingKey}
            onSaveKey={showAll && onSaveKey ? (apiKey) => onSaveKey('claude_code', apiKey) : undefined}
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
            authStatus={geminiAuthStatus}
            authMessage={geminiAuthMessage}
            isCheckingAuth={isCheckingGeminiAuth}
            isSavingKey={isSavingKey}
            onSaveKey={showAll && onSaveKey ? (apiKey) => onSaveKey('gemini_cli', apiKey) : undefined}
          />
          {/* Codex CLI */}
          <CLIStatusCard
            cliType="codex_cli"
            status={codexCLIStatus}
            isLoading={isLoadingCodexCLI || isRefreshingCodexCLI}
            isSelected={selectedCLI === 'codex_cli'}
            onRefresh={onRefreshCodexCLI}
            onSelect={() => onSelectCLI('codex_cli')}
            onTest={() => onTestCLI('codex_cli')}
            isTesting={testingCLI === 'codex_cli'}
            models={CODEX_CLI_MODELS}
            selectedModel={codexCLIModel}
            onModelChange={onCodexCLIModelChange}
            authStatus={codexAuthStatus}
            authMessage={codexAuthMessage}
            isCheckingAuth={isCheckingCodexAuth}
            isSavingKey={isSavingKey}
            onSaveKey={showAll && onSaveKey ? (apiKey) => onSaveKey('codex_cli', apiKey) : undefined}
          />
        </div>
      )}
    </div>
  )
}
