import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import { X, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'

const FullScreenDialog = DialogPrimitive.Root

const FullScreenDialogTrigger = DialogPrimitive.Trigger

const FullScreenDialogPortal = DialogPrimitive.Portal

const FullScreenDialogClose = DialogPrimitive.Close

const FullScreenDialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
))
FullScreenDialogOverlay.displayName = 'FullScreenDialogOverlay'

interface FullScreenDialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  allowMinimize?: boolean
  onMinimize?: () => void
}

const FullScreenDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  FullScreenDialogContentProps
>(({ className, children, allowMinimize, onMinimize, ...props }, ref) => (
  <FullScreenDialogPortal>
    <FullScreenDialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 bg-background',
        'flex flex-col',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        className
      )}
      {...props}
    >
      {children}
      <div className="absolute right-4 top-4 flex items-center gap-2">
        {allowMinimize && onMinimize && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-sm opacity-70 hover:opacity-100"
            onClick={onMinimize}
          >
            <Minimize2 className="h-4 w-4" />
            <span className="sr-only">Minimize</span>
          </Button>
        )}
        <DialogPrimitive.Close className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </div>
    </DialogPrimitive.Content>
  </FullScreenDialogPortal>
))
FullScreenDialogContent.displayName = 'FullScreenDialogContent'

const FullScreenDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex items-center justify-between px-6 py-4 border-b bg-background sticky top-0 z-10',
      className
    )}
    {...props}
  />
)
FullScreenDialogHeader.displayName = 'FullScreenDialogHeader'

const FullScreenDialogBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex-1 overflow-auto p-6', className)}
    {...props}
  />
)
FullScreenDialogBody.displayName = 'FullScreenDialogBody'

const FullScreenDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex items-center justify-end gap-2 px-6 py-4 border-t bg-background sticky bottom-0 z-10',
      className
    )}
    {...props}
  />
)
FullScreenDialogFooter.displayName = 'FullScreenDialogFooter'

const FullScreenDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-xl font-semibold leading-none tracking-tight', className)}
    {...props}
  />
))
FullScreenDialogTitle.displayName = 'FullScreenDialogTitle'

const FullScreenDialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
FullScreenDialogDescription.displayName = 'FullScreenDialogDescription'

// Toggle button to enter fullscreen mode
interface FullScreenToggleProps {
  onClick: () => void
  className?: string
}

const FullScreenToggle = ({ onClick, className }: FullScreenToggleProps) => {
  const { t } = useTranslation('common')
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={cn('h-8 w-8', className)}
      title={t('fullscreen')}
    >
      <Maximize2 className="h-4 w-4" />
      <span className="sr-only">{t('fullscreen')}</span>
    </Button>
  )
}

export {
  FullScreenDialog,
  FullScreenDialogPortal,
  FullScreenDialogOverlay,
  FullScreenDialogClose,
  FullScreenDialogTrigger,
  FullScreenDialogContent,
  FullScreenDialogHeader,
  FullScreenDialogBody,
  FullScreenDialogFooter,
  FullScreenDialogTitle,
  FullScreenDialogDescription,
  FullScreenToggle,
}
