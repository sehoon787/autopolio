import { Activity, Zap } from 'lucide-react'
import { useUsageStore } from '@/stores/usageStore'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1 rounded-md hover:bg-accent cursor-default">
              <Activity className="h-3 w-3" />
              <span>{stats.dailyApiCalls}</span>
              {totalTokens > 0 && (
                <>
                  <span className="text-muted-foreground/50">|</span>
                  <Zap className="h-3 w-3" />
                  <span>{formatNumber(totalTokens)}</span>
                </>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            <div className="space-y-1">
              <p>API Calls Today: {stats.dailyApiCalls}</p>
              <p>Session Calls: {stats.sessionApiCalls}</p>
              {totalTokens > 0 && (
                <>
                  <p className="border-t pt-1 mt-1">Token Usage:</p>
                  {stats.llmTokensUsed.openai > 0 && (
                    <p>OpenAI: {formatNumber(stats.llmTokensUsed.openai)}</p>
                  )}
                  {stats.llmTokensUsed.anthropic > 0 && (
                    <p>Anthropic: {formatNumber(stats.llmTokensUsed.anthropic)}</p>
                  )}
                  {stats.llmTokensUsed.gemini > 0 && (
                    <p>Gemini: {formatNumber(stats.llmTokensUsed.gemini)}</p>
                  )}
                </>
              )}
              <p className="border-t pt-1 mt-1">Session: {stats.sessionDuration}m</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
