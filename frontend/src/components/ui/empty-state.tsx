import { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  /** Icon to display */
  icon?: LucideIcon
  /** Main title */
  title: string
  /** Description text */
  description?: string
  /** Primary action button */
  action?: {
    label: string
    onClick: () => void
    icon?: LucideIcon
  }
  /** Secondary action */
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  /** Whether to wrap in a Card */
  withCard?: boolean
  /** Additional class names */
  className?: string
  /** Icon color class (default: text-muted-foreground/30) */
  iconClassName?: string
}

/**
 * Common empty state component with consistent styling
 * 
 * @example
 * ```tsx
 * // Simple usage
 * <EmptyState
 *   icon={FolderOpen}
 *   title="No projects found"
 *   description="Create your first project to get started"
 * />
 * 
 * // With action button
 * <EmptyState
 *   icon={Medal}
 *   title="No certifications"
 *   description="Add your professional certifications"
 *   action={{
 *     label: "Add Certification",
 *     onClick: handleAdd,
 *     icon: Plus,
 *   }}
 *   withCard
 * />
 * 
 * // With secondary action
 * <EmptyState
 *   icon={Search}
 *   title="No results"
 *   description="Try adjusting your search filters"
 *   secondaryAction={{
 *     label: "Clear filters",
 *     onClick: handleClear,
 *   }}
 * />
 * ```
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  withCard = false,
  className,
  iconClassName = 'text-muted-foreground/30',
}: EmptyStateProps) {
  const content = (
    <div className={cn(
      'flex flex-col items-center justify-center py-12 text-center',
      className
    )}>
      {Icon && (
        <Icon className={cn('h-16 w-16 mb-4', iconClassName)} />
      )}
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      {description && (
        <p className="text-muted-foreground mb-4 max-w-md">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="flex flex-wrap gap-2 justify-center">
          {action && (
            <Button onClick={action.onClick}>
              {action.icon && <action.icon className="h-4 w-4 mr-2" />}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )

  if (withCard) {
    return (
      <Card>
        <CardContent className="p-0">
          {content}
        </CardContent>
      </Card>
    )
  }

  return content
}

/**
 * Compact empty state for smaller containers (tables, lists)
 */
export function EmptyStateCompact({
  message,
  className,
}: {
  message: string
  className?: string
}) {
  return (
    <div className={cn(
      'text-center py-8 text-muted-foreground',
      className
    )}>
      {message}
    </div>
  )
}
