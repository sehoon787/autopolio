import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SelectableTileProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'id'> {
  /** Unique identifier for this tile */
  id: string | number
  /** Whether the tile is selected */
  selected: boolean
  /** Callback when selection state changes */
  onSelectChange: (id: string | number, selected: boolean) => void
  /** Whether the tile is disabled */
  disabled?: boolean
  /** Additional class names */
  className?: string
  /** Children to render inside the tile */
  children: React.ReactNode
}

/**
 * A selectable tile component without a visible checkbox.
 * The entire tile is clickable and shows selection through visual styling.
 * Includes keyboard accessibility (Enter/Space to toggle).
 */
export const SelectableTile = React.forwardRef<HTMLDivElement, SelectableTileProps>(
  (
    {
      id,
      selected,
      onSelectChange,
      disabled = false,
      className,
      children,
      onClick,
      onKeyDown,
      ...props
    },
    ref
  ) => {
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return
      onSelectChange(id, !selected)
      onClick?.(e)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelectChange(id, !selected)
      }
      onKeyDown?.(e)
    }

    return (
      <div
        ref={ref}
        role="checkbox"
        aria-checked={selected}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          // Base styles
          'rounded-lg border bg-card text-card-foreground shadow-sm',
          'cursor-pointer transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          // Selection states
          selected
            ? 'ring-2 ring-primary bg-primary/5 border-primary/50'
            : 'hover:bg-accent/50',
          // Disabled state
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        {...props}
      >
        {/* Hidden checkbox for form compatibility */}
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          readOnly
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
        {children}
      </div>
    )
  }
)

SelectableTile.displayName = 'SelectableTile'
