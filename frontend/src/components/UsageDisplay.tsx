import { Activity, Zap, Clock } from 'lucide-react'
import { useUsageStore } from '@/stores/usageStore'

interface UsageDisplayProps {
  compact?: boolean
}

export function UsageDisplay({ compact = true }: UsageDisplayProps) {
  const { getUsageStats } = useUsageStore()
  const stats = getUsageStats()

  const totalTokens =
    stats.llmTokensUsed.openai +
    stats.llmTokensUsed.anthropic +
    stats.llmTokensUsed.gemini

  if (compact) {
    // Always show detailed stats without requiring hover
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            <span>API Today</span>
          </div>
          <span className="font-medium">{stats.dailyApiCalls}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Activity className="h-3 w-3 opacity-60" />
            <span>Session</span>
          </div>
          <span className="font-medium">{stats.sessionApiCalls}</span>
        </div>
        {totalTokens > 0 && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3 w-3" />
              <span>Tokens</span>
            </div>
            <span className="font-medium">{formatNumber(totalTokens)}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            <span>Duration</span>
          </div>
          <span className="font-medium">{stats.sessionDuration}m</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
      <h4 className="text-sm font-medium">Usage Statistics</h4>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">API Calls Today</p>
          <p className="text-2xl font-bold">{stats.dailyApiCalls}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Session Calls</p>
          <p className="text-2xl font-bold">{stats.sessionApiCalls}</p>
        </div>
      </div>

      {totalTokens > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Token Usage</p>
          <div className="space-y-1">
            {stats.llmTokensUsed.openai > 0 && (
              <TokenBar
                label="OpenAI"
                value={stats.llmTokensUsed.openai}
                max={100000}
                color="bg-green-500"
              />
            )}
            {stats.llmTokensUsed.anthropic > 0 && (
              <TokenBar
                label="Anthropic"
                value={stats.llmTokensUsed.anthropic}
                max={100000}
                color="bg-orange-500"
              />
            )}
            {stats.llmTokensUsed.gemini > 0 && (
              <TokenBar
                label="Gemini"
                value={stats.llmTokensUsed.gemini}
                max={100000}
                color="bg-blue-500"
              />
            )}
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
