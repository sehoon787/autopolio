import { Zap, Hash } from 'lucide-react'
import { useUsageStore, type LLMUsage } from '@/stores/usageStore'
import { useAppStore } from '@/stores/appStore'

interface UsageDisplayProps {
  compact?: boolean
}

const providerColors: Record<string, string> = {
  openai: 'bg-green-500',
  anthropic: 'bg-orange-500',
  gemini: 'bg-blue-500',
  claude_code_cli: 'bg-orange-400',
  gemini_cli: 'bg-blue-400',
}

const providerLabels: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  claude_code_cli: 'Claude CLI',
  gemini_cli: 'Gemini CLI',
}

export function UsageDisplay({ compact = true }: UsageDisplayProps) {
  const { getTokensForProvider, getLLMCallCount } = useUsageStore()
  const { aiMode, selectedLLMProvider, selectedCLI } = useAppStore()

  const isCliMode = aiMode === 'cli'

  // Map CLI selection to its own usage category
  const provider: keyof LLMUsage = isCliMode
    ? (selectedCLI === 'claude_code' ? 'claude_code_cli' : 'gemini_cli')
    : (selectedLLMProvider as 'openai' | 'anthropic' | 'gemini')

  const calls = provider ? getLLMCallCount(provider) : 0
  const tokens = provider ? getTokensForProvider(provider) : 0
  const showTokens = true

  if (compact) {
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

  return (
    <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
      <h4 className="text-sm font-medium">Usage Statistics</h4>
      <div>
        <p className="text-xs text-muted-foreground">{providerLabels[provider] || provider} Calls</p>
        <p className="text-2xl font-bold">{calls}</p>
      </div>
      {showTokens && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Token Usage</p>
          <div className="space-y-1">
            <TokenBar
              label={providerLabels[provider] || provider}
              value={tokens}
              max={100000}
              color={providerColors[provider] || 'bg-gray-500'}
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
