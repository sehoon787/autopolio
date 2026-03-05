import { useEffect } from 'react'
import { Zap, Hash } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useUsageStore, type LLMUsage } from '@/stores/usageStore'
import { useAppStore } from '@/stores/appStore'
import { AI_MODES, CLI_TYPES, PROVIDER_META } from '@/constants'
import { isElectron } from '@/lib/electron'
import { llmApi } from '@/api/llm'

interface UsageDisplayProps {
  compact?: boolean
}

export function UsageDisplay({ compact = true }: UsageDisplayProps) {
  const { getTokensForProvider, getLLMCallCount, resetDailyIfNeeded } = useUsageStore()
  const { aiMode, selectedLLMProvider, selectedCLI } = useAppStore()

  // Reset daily counters on mount (must be in useEffect, not during render)
  useEffect(() => {
    resetDailyIfNeeded()
  }, [])

  // Fetch runtime to determine display mode (deduplicates with settings page query)
  const { data: llmConfig } = useQuery({
    queryKey: ['llmConfig'],
    queryFn: async () => (await llmApi.getConfig()).data,
    staleTime: 5 * 60 * 1000,
  })
  const runtime = llmConfig?.runtime
  const showRawNumbers = isElectron() || runtime === 'local' || runtime === 'docker'

  const isCliMode = aiMode === AI_MODES.CLI

  // Map CLI selection to its own usage category
  const cliUsageKey = selectedCLI === CLI_TYPES.CLAUDE_CODE ? 'claude_code_cli'
    : selectedCLI === CLI_TYPES.CODEX_CLI ? 'codex_cli'
    : 'gemini_cli'
  const provider: keyof LLMUsage = isCliMode
    ? cliUsageKey
    : (selectedLLMProvider as 'openai' | 'anthropic' | 'gemini')

  const calls = provider ? getLLMCallCount(provider) : 0
  const tokens = provider ? getTokensForProvider(provider) : 0
  const showTokens = true

  if (compact) {
    if (showRawNumbers) {
      return (
        <div className="px-3 py-2 text-xs text-muted-foreground space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Hash className="h-3 w-3" />
              <span>Calls</span>
            </div>
            <span className="font-medium">{calls}</span>
          </div>
          {showTokens && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3 w-3" />
                <span>Tokens</span>
              </div>
              <span className="font-medium">{formatNumber(tokens)}</span>
            </div>
          )}
        </div>
      )
    }

    const callsPct = Math.min(Math.round((calls / 50) * 100), 100)
    const tokensPct = Math.min(Math.round((tokens / 100000) * 100), 100)

    return (
      <div className="px-3 py-2 text-xs text-muted-foreground space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-11 shrink-0">Calls</span>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary/60 rounded-full transition-all duration-300"
              style={{ width: `${callsPct}%` }}
            />
          </div>
          <span className="w-8 text-right font-medium">{callsPct}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-11 shrink-0">Tokens</span>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary/60 rounded-full transition-all duration-300"
              style={{ width: `${tokensPct}%` }}
            />
          </div>
          <span className="w-8 text-right font-medium">{tokensPct}%</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
      <h4 className="text-sm font-medium">Usage Statistics</h4>
      <div>
        <p className="text-xs text-muted-foreground">{PROVIDER_META[provider]?.label ?? provider} Calls</p>
        <p className="text-2xl font-bold">{calls}</p>
      </div>
      {showTokens && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Token Usage</p>
          <div className="space-y-1">
            <TokenBar
              label={PROVIDER_META[provider]?.label ?? provider}
              value={tokens}
              max={100000}
              color={PROVIDER_META[provider]?.color ?? 'bg-gray-500'}
            />
          </div>
        </div>
      )}
    </div>
  )
}

interface TokenBarProps {
  label: string
  value: number
  max: number
  color: string
}

function TokenBar({ label, value, max, color }: TokenBarProps) {
  const percentage = Math.min((value / max) * 100, 100)

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground">{formatNumber(value)}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}
