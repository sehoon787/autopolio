import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { CLIStatusCard } from '@/components/CLIStatusCard'
import { CLAUDE_CODE_MODELS, GEMINI_CLI_MODELS, CODEX_CLI_MODELS } from '@/stores/appStore'
import { CLI_TYPES } from '@/constants'
import type { CLIType } from '@/constants'
import type { CLIStatus as ElectronCLIStatus } from '@/lib/electron'
import type { CLIStatus as APICLIStatus } from '@/api/llm'

// Accept either electron or API CLI status type
type CLIStatus = ElectronCLIStatus | APICLIStatus

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
  selectedCLI: CLIType
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
  // Native login props (Electron only)
  isNativeLoggingIn?: string | null
  loginUrl?: string | null
  claudeNativeAuthEmail?: string | null
  geminiNativeAuthAccount?: string | null
  codexNativeAuthAccount?: string | null
  onNativeLogin?: (tool: CLIType) => void
  onCancelNativeLogin?: () => void
  onNativeLogout?: (tool: CLIType) => void
  onRefreshAll: () => void
  onRefreshClaudeCLI: () => void
  onRefreshGeminiCLI: () => void
  onRefreshCodexCLI: () => void
  onSelectCLI: (cliType: CLIType) => void
  onTestCLI: (cliType: CLIType) => void
  onClaudeCodeModelChange: (model: string) => void
  onGeminiCLIModelChange: (model: string) => void
  onCodexCLIModelChange: (model: string) => void
  onSaveKey?: (cliType: CLIType, apiKey: string) => void
  onSubmitAuthCode?: (code: string) => void
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
  isNativeLoggingIn,
  loginUrl,
  claudeNativeAuthEmail,
  geminiNativeAuthAccount,
  codexNativeAuthAccount,
  onNativeLogin,
  onCancelNativeLogin,
  onNativeLogout,
  onSubmitAuthCode,
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
            cliType={CLI_TYPES.CLAUDE_CODE}
            status={claudeCLIStatus}
            isLoading={isLoadingClaudeCLI || isRefreshingClaudeCLI}
            isSelected={selectedCLI === CLI_TYPES.CLAUDE_CODE}
            onRefresh={onRefreshClaudeCLI}
            onSelect={() => onSelectCLI(CLI_TYPES.CLAUDE_CODE)}
            onTest={() => onTestCLI(CLI_TYPES.CLAUDE_CODE)}
            isTesting={testingCLI === CLI_TYPES.CLAUDE_CODE}
            models={CLAUDE_CODE_MODELS}
            selectedModel={claudeCodeModel}
            onModelChange={onClaudeCodeModelChange}
            authStatus={claudeAuthStatus}
            authMessage={claudeAuthMessage}
            isCheckingAuth={isCheckingClaudeAuth}
            isSavingKey={isSavingKey}
            onSaveKey={showAll && onSaveKey ? (apiKey) => onSaveKey(CLI_TYPES.CLAUDE_CODE, apiKey) : undefined}
            supportsNativeLogin={showAll && !!onNativeLogin}
            isNativeLoggingIn={isNativeLoggingIn === CLI_TYPES.CLAUDE_CODE}
            loginUrl={isNativeLoggingIn === CLI_TYPES.CLAUDE_CODE ? loginUrl : null}
            nativeAuthEmail={claudeNativeAuthEmail}
            onNativeLogin={onNativeLogin ? () => onNativeLogin(CLI_TYPES.CLAUDE_CODE) : undefined}
            onCancelNativeLogin={onCancelNativeLogin}
            onNativeLogout={onNativeLogout ? () => onNativeLogout(CLI_TYPES.CLAUDE_CODE) : undefined}
            onSubmitAuthCode={onSubmitAuthCode}
          />
          {/* Gemini CLI */}
          <CLIStatusCard
            cliType={CLI_TYPES.GEMINI_CLI}
            status={geminiCLIStatus}
            isLoading={isLoadingGeminiCLI || isRefreshingGeminiCLI}
            isSelected={selectedCLI === CLI_TYPES.GEMINI_CLI}
            onRefresh={onRefreshGeminiCLI}
            onSelect={() => onSelectCLI(CLI_TYPES.GEMINI_CLI)}
            onTest={() => onTestCLI(CLI_TYPES.GEMINI_CLI)}
            isTesting={testingCLI === CLI_TYPES.GEMINI_CLI}
            models={GEMINI_CLI_MODELS}
            selectedModel={geminiCLIModel}
            onModelChange={onGeminiCLIModelChange}
            authStatus={geminiAuthStatus}
            authMessage={geminiAuthMessage}
            isCheckingAuth={isCheckingGeminiAuth}
            isSavingKey={isSavingKey}
            onSaveKey={showAll && onSaveKey ? (apiKey) => onSaveKey(CLI_TYPES.GEMINI_CLI, apiKey) : undefined}
            supportsNativeLogin={showAll && !!onNativeLogin}
            isNativeLoggingIn={isNativeLoggingIn === CLI_TYPES.GEMINI_CLI}
            loginUrl={isNativeLoggingIn === CLI_TYPES.GEMINI_CLI ? loginUrl : null}
            nativeAuthEmail={geminiNativeAuthAccount}
            onNativeLogin={onNativeLogin ? () => onNativeLogin(CLI_TYPES.GEMINI_CLI) : undefined}
            onCancelNativeLogin={onCancelNativeLogin}
            onNativeLogout={onNativeLogout ? () => onNativeLogout(CLI_TYPES.GEMINI_CLI) : undefined}
            onSubmitAuthCode={onSubmitAuthCode}
          />
          {/* Codex CLI */}
          <CLIStatusCard
            cliType={CLI_TYPES.CODEX_CLI}
            status={codexCLIStatus}
            isLoading={isLoadingCodexCLI || isRefreshingCodexCLI}
            isSelected={selectedCLI === CLI_TYPES.CODEX_CLI}
            onRefresh={onRefreshCodexCLI}
            onSelect={() => onSelectCLI(CLI_TYPES.CODEX_CLI)}
            onTest={() => onTestCLI(CLI_TYPES.CODEX_CLI)}
            isTesting={testingCLI === CLI_TYPES.CODEX_CLI}
            models={CODEX_CLI_MODELS}
            selectedModel={codexCLIModel}
            onModelChange={onCodexCLIModelChange}
            authStatus={codexAuthStatus}
            authMessage={codexAuthMessage}
            isCheckingAuth={isCheckingCodexAuth}
            isSavingKey={isSavingKey}
            onSaveKey={showAll && onSaveKey ? (apiKey) => onSaveKey(CLI_TYPES.CODEX_CLI, apiKey) : undefined}
            supportsNativeLogin={showAll && !!onNativeLogin}
            isNativeLoggingIn={isNativeLoggingIn === CLI_TYPES.CODEX_CLI}
            loginUrl={isNativeLoggingIn === CLI_TYPES.CODEX_CLI ? loginUrl : null}
            nativeAuthEmail={codexNativeAuthAccount}
            onNativeLogin={onNativeLogin ? () => onNativeLogin(CLI_TYPES.CODEX_CLI) : undefined}
            onCancelNativeLogin={onCancelNativeLogin}
            onNativeLogout={onNativeLogout ? () => onNativeLogout(CLI_TYPES.CODEX_CLI) : undefined}
            onSubmitAuthCode={onSubmitAuthCode}
          />
        </div>
      )}
    </div>
  )
}
