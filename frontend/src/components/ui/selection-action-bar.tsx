import * as React from 'react'
import { useId } from 'react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'

export interface SelectionActionBarProps {
  /** Total count of items available for selection */
  totalCount: number
  /** Number of currently selected items */
  selectedCount: number
  /** Callback when "select all" checkbox changes */
  onSelectAllChange: (selectAll: boolean) => void
  /** Label for the select all checkbox (default: "Select all") */
  selectAllLabel?: string
  /** Label template for selected count. Use {count} as placeholder. */
  selectedCountLabel?: string
  /** Children (action buttons) - will be auto-disabled when nothing selected */
  children?: React.ReactNode
  /** Additional class names */
  className?: string
  /** Bar variant */
  variant?: 'default' | 'sticky' | 'floating'
}

/**
 * A selection action bar that shows a "select all" checkbox and action buttons.
 * Action buttons are automatically disabled when nothing is selected.
 */
export function SelectionActionBar({
  totalCount,
  selectedCount,
  onSelectAllChange,
  selectAllLabel = 'Select all',
  selectedCountLabel = '({count} selected)',
  children,
  className,
  variant = 'default',
}: SelectionActionBarProps) {
  const checkboxId = useId()
  const isAllSelected = totalCount > 0 && selectedCount === totalCount
  const isIndeterminate = selectedCount > 0 && selectedCount < totalCount
  const hasSelection = selectedCount > 0

  const handleSelectAllChange = (checked: boolean | 'indeterminate') => {
    onSelectAllChange(checked === true)
  }

  // Clone children and inject disabled prop when nothing is selected
  const processedChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child

    // If it's a button-like element and nothing is selected, disable it
    if (!hasSelection && typeof child.type !== 'string') {
      return React.cloneElement(child as React.ReactElement<{ disabled?: boolean }>, {
        disabled: true,
      })
    }

    return child
  })

  const variantStyles = {
    default: 'bg-gray-50 rounded-lg border',
    sticky: 'bg-gray-50/95 backdrop-blur-sm rounded-lg border sticky top-0 z-10',
    floating:
      'bg-white/95 backdrop-blur-sm rounded-lg border shadow-lg fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between p-3',
        variantStyles[variant],
        className
      )}
    >
      {/* Left side: Select all checkbox and count */}
      <div className="flex items-center gap-3">
        <Checkbox
          id={checkboxId}
          checked={isIndeterminate ? 'indeterminate' : isAllSelected}
          onCheckedChange={handleSelectAllChange}
        />
        <label
          htmlFor={checkboxId}
          className="text-sm font-medium cursor-pointer select-none"
        >
          {selectAllLabel}
        </label>
        {selectedCount > 0 && (
          <span className="text-sm text-gray-500">
            {selectedCountLabel.replace('{count}', String(selectedCount))}
          </span>
        )}
      </div>

      {/* Right side: Action buttons with gap-4 */}
      <div className="flex items-center gap-4">{processedChildren}</div>
    </div>
  )
}
