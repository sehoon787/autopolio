import { Component, ReactNode } from 'react'
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

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    window.location.href = '/dashboard'
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center">
          <div className="w-full max-w-md">
            <div className="flex justify-center mb-6">
              <div className="h-16 w-16 rounded-full bg-yellow-100 flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-yellow-600" />
              </div>
            </div>

            <h2 className="text-xl font-semibold mb-2 text-gray-900">
              문제가 발생했습니다
            </h2>
            <p className="text-gray-500 mb-6">
              예기치 않은 오류가 발생했습니다. 페이지를 새로고침하거나 다시 시도해주세요.
            </p>

            {this.state.error && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg text-left">
                <p className="text-sm font-medium text-gray-700 mb-1">오류 내용:</p>
                <p className="text-sm text-red-600 font-mono break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleRetry} variant="outline">
                다시 시도
              </Button>
              <Button onClick={this.handleReload}>
                <RefreshCw className="h-4 w-4 mr-2" />
                새로고침
              </Button>
              <Button onClick={this.handleGoHome} variant="ghost">
                <Home className="h-4 w-4 mr-2" />
                대시보드로
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
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
      return (
        <div className="p-6 border border-red-200 rounded-lg bg-red-50">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-800">
                이 섹션을 불러오는 중 오류가 발생했습니다
              </h3>
              {this.state.error && (
                <p className="mt-1 text-sm text-red-600">
                  {this.state.error.message}
                </p>
              )}
              <Button
                onClick={this.handleRetry}
                size="sm"
                variant="outline"
                className="mt-3"
              >
                다시 시도
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
