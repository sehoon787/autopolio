import { Component, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: React.ErrorInfo
}

// Translated fallback UI for ErrorBoundary (class components can't use hooks)
function ErrorFallbackUI({ error, onRetry }: { error?: Error; onRetry: () => void }) {
  const { t } = useTranslation('common')

  return (
    <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 rounded-full bg-yellow-100 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-yellow-600" />
          </div>
        </div>

        <h2 className="text-xl font-semibold mb-2 text-gray-900">
          {t('errorBoundary.title')}
        </h2>
        <p className="text-gray-500 mb-6">
          {t('errorBoundary.description')}
        </p>

        {error && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg text-left">
            <p className="text-sm font-medium text-gray-700 mb-1">{t('errorBoundary.errorDetails')}</p>
            <p className="text-sm text-red-600 font-mono break-all">
              {error.message}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={onRetry} variant="outline">
            {t('errorBoundary.retry')}
          </Button>
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('errorBoundary.reload')}
          </Button>
          <Button onClick={() => { window.location.href = '/dashboard' }} variant="ghost">
            <Home className="h-4 w-4 mr-2" />
            {t('errorBoundary.goToDashboard')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo })
    // Log error for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return <ErrorFallbackUI error={this.state.error} onRetry={this.handleRetry} />
    }

    return this.props.children
  }
}

// Translated fallback UI for PageErrorBoundary
function PageErrorFallbackUI({ error, onRetry }: { error?: Error; onRetry: () => void }) {
  const { t } = useTranslation('common')

  return (
    <div className="p-6 border border-red-200 rounded-lg bg-red-50">
      <div className="flex items-start gap-4">
        <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800">
            {t('errorBoundary.sectionError')}
          </h3>
          {error && (
            <p className="mt-1 text-sm text-red-600">
              {error.message}
            </p>
          )}
          <Button
            onClick={onRetry}
            size="sm"
            variant="outline"
            className="mt-3"
          >
            {t('errorBoundary.retry')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Page-level error boundary with less dramatic UI
export class PageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      return <PageErrorFallbackUI error={this.state.error} onRetry={this.handleRetry} />
    }

    return this.props.children
  }
}
