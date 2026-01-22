import { useEffect, useState } from 'react'
import { AlertTriangle, X, Clock } from 'lucide-react'
import { useRateLimitStore } from '@/stores/rateLimitStore'
import { formatRemainingTime } from '@/lib/rateLimitDetector'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RateLimitBannerProps {
  className?: string
}

export function RateLimitBanner({ className }: RateLimitBannerProps) {
  const { isRateLimited, getRemainingTime, lastRateLimitEvent, clearRateLimit } =
    useRateLimitStore()
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!isRateLimited) {
      setDismissed(false)
      return
    }

    const updateRemaining = () => {
      const remaining = getRemainingTime()
      setRemainingSeconds(remaining)

      if (remaining === null || remaining <= 0) {
        clearRateLimit()
      }
    }

    updateRemaining()
    const interval = setInterval(updateRemaining, 1000)

    return () => clearInterval(interval)
  }, [isRateLimited, getRemainingTime, clearRateLimit])

  if (!isRateLimited || dismissed) {
    return null
  }

  const providerName = lastRateLimitEvent?.provider || 'API'

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-50 bg-yellow-500 dark:bg-yellow-600 text-yellow-950',
        'px-4 py-2 shadow-md',
        className
      )}
    >
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div className="flex items-center gap-2 text-sm font-medium">
            <span>Rate limit reached</span>
            {providerName !== 'generic' && (
              <span className="opacity-75">({providerName})</span>
            )}
            {remainingSeconds && remainingSeconds > 0 && (
              <span className="flex items-center gap-1 bg-yellow-600 dark:bg-yellow-700 px-2 py-0.5 rounded text-xs">
                <Clock className="h-3 w-3" />
                {formatRemainingTime(remainingSeconds)}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 hover:bg-yellow-600 dark:hover:bg-yellow-700"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
