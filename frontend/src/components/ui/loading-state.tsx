import { RefreshCw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingStateProps {
  /** Loading message (optional) */
  message?: string
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Spinner variant */
  variant?: 'spinner' | 'dots' | 'refresh'
  /** Additional class names */
  className?: string
  /** Center in container (default: true) */
  centered?: boolean
}

/**
 * Common loading state component with consistent styling
 * 
 * @example
 * ```tsx
 * // Simple usage
 * {isLoading && <LoadingState />}
 * 
 * // With message
 * {isLoading && <LoadingState message="Loading projects..." />}
 * 
 * // Different sizes
 * <LoadingState size="sm" />
 * <LoadingState size="lg" message="Please wait..." />
 * ```
 */
export function LoadingState({
  message,
  size = 'md',
  variant = 'spinner',
  className,
  centered = true,
}: LoadingStateProps) {
  const sizeClasses = {
    sm: { icon: 'h-4 w-4', text: 'text-sm', padding: 'py-4' },
    md: { icon: 'h-6 w-6', text: 'text-base', padding: 'py-8' },
    lg: { icon: 'h-8 w-8', text: 'text-lg', padding: 'py-12' },
  }

  const { icon, text, padding } = sizeClasses[size]

  const renderSpinner = () => {
    switch (variant) {
      case 'refresh':
        return <RefreshCw className={cn(icon, 'animate-spin text-muted-foreground')} />
      case 'dots':
        return (
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={cn(
                  'rounded-full bg-muted-foreground',
                  size === 'sm' ? 'h-1.5 w-1.5' : size === 'lg' ? 'h-3 w-3' : 'h-2 w-2',
                  'animate-bounce'
                )}
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        )
      case 'spinner':
      default:
        return <Loader2 className={cn(icon, 'animate-spin text-muted-foreground')} />
    }
  }

  return (
    <div
      className={cn(
        padding,
        centered && 'flex flex-col items-center justify-center',
        className
      )}
    >
      {renderSpinner()}
      {message && (
        <span className={cn('mt-2 text-muted-foreground', text)}>
          {message}
        </span>
      )}
    </div>
  )
}

/**
 * Inline loading spinner for buttons or inline content
 */
export function LoadingSpinner({
  size = 'sm',
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  }

  return (
    <Loader2 className={cn(sizeClasses[size], 'animate-spin', className)} />
  )
}
