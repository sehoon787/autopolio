import * as React from 'react'
import { useRef, useEffect, useState } from 'react'
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
    const prevSelectedRef = useRef(selected)
    const [isFlashing, setIsFlashing] = useState(false)

    // Trigger flash animation when selected changes from false to true
    useEffect(() => {
      if (selected && !prevSelectedRef.current) {
        setIsFlashing(true)
        const timer = setTimeout(() => setIsFlashing(false), 5300)
        return () => clearTimeout(timer)
      }
      prevSelectedRef.current = selected
    }, [selected])

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
          'relative rounded-lg border bg-card text-card-foreground',
          'cursor-pointer transition-all duration-200 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          // Selection states
          selected
            ? [
                // Selected: strong visual feedback with theme colors
                'border-primary/40 border-l-4 border-l-primary',
                'bg-primary/10 dark:bg-primary/15',
                'shadow-md shadow-primary/10',
                // Flash animation on select
                isFlashing && 'animate-selection-flash',
              ]
            : [
                // Unselected: clean hover effect
                'border-border shadow-sm',
                'hover:border-primary/30 hover:bg-accent/30 hover:shadow-md hover:-translate-y-0.5',
              ],
          // Disabled state
          disabled && 'opacity-50 cursor-not-allowed hover:translate-y-0 hover:shadow-sm hover:bg-card',
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
