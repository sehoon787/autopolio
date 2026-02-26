import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { usePipelineStore } from '@/stores/pipelineStore'
import { useUsageStore, LLMUsage } from '@/stores/usageStore'
import { pipelineApi } from '@/api/pipeline'
import { getFullApiUrl } from '@/lib/apiUrl'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  Download,
  RotateCcw,
  Github,
  Code,
  Cpu,
  Trophy,
  Brain,
  FileText,
  File,
  AlertTriangle,
} from 'lucide-react'

// Maximum consecutive errors before stopping polling
const MAX_POLL_ERRORS = 5

const stepIcons = [
  Github,    // GitHub Analysis
  Code,      // Code Extraction
  Cpu,       // Tech Detection
  Trophy,    // Achievement Detection
  Brain,     // LLM Summarization
  FileText,  // Template Mapping
  File,      // Document Generation
]

export default function PipelinePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation('pipeline')
  const { currentTaskId, status, setStatus, reset } = usePipelineStore()
  const { trackTokenUsage, incrementLLMCallCount } = useUsageStore()
  const usageTrackedRef = useRef<string | null>(null) // Track which task's usage has been recorded
  const documentsInvalidatedRef = useRef<string | null>(null) // Track if documents cache was invalidated
  const [pollErrorCount, setPollErrorCount] = useState(0)
  const [pollingStopped, setPollingStopped] = useState(false)

  const { data: statusData, error: queryError, refetch } = useQuery({
    queryKey: ['pipeline-status', currentTaskId],
    queryFn: () => pipelineApi.getStatus(currentTaskId!),
    enabled: !!currentTaskId && !pollingStopped,
    retry: 2, // Retry failed requests up to 2 times
    retryDelay: 1000, // Wait 1 second between retries
    refetchInterval: (query) => {
      // Stop polling if too many errors
      if (pollingStopped) {
        return false
      }
      const data = query.state.data?.data
      // Stop polling when completed AND result is available
      if (data?.status === 'completed' && data?.result) {
        return false
      }
      // Stop polling on terminal states (failed, cancelled)
      if (data?.status === 'failed' || data?.status === 'cancelled') {
        return false
      }
      // Continue polling for all other cases (pending, running, or completed without result)
      return 2000 // Poll every 2 seconds instead of 1 to reduce load
    },
  })

  // Track query errors and stop polling after too many failures
  useEffect(() => {
    if (queryError) {
      setPollErrorCount((prev) => {
        const newCount = prev + 1
        if (newCount >= MAX_POLL_ERRORS) {
          console.error('[Pipeline] Too many polling errors, stopping polling')
          setPollingStopped(true)
        }
        return newCount
      })
    } else if (statusData?.data) {
      // Reset error count on successful response
      setPollErrorCount(0)
    }
  }, [queryError, statusData])

  // Reset polling state when task changes
  useEffect(() => {
    setPollErrorCount(0)
    setPollingStopped(false)
  }, [currentTaskId])

  useEffect(() => {
    if (statusData?.data) {
      setStatus(statusData.data)
    }
  }, [statusData, setStatus])

  // Track LLM usage when pipeline completes (only once per task)
  useEffect(() => {
    if (status?.status === 'completed' && status.result && currentTaskId) {
      // Prevent double-counting: only track once per task
      if (usageTrackedRef.current === currentTaskId) {
        return
      }
      usageTrackedRef.current = currentTaskId

      const result = status.result as Record<string, unknown>
      const tokensUsed = result.llm_tokens_used as number | undefined
      const executionMode = result.llm_execution_mode as string | undefined
      const cliType = result.llm_cli_type as string | undefined
      const llmProvider = result.llm_provider as string | undefined

      // Determine which provider to track
      let provider: keyof LLMUsage | null = null
      if (executionMode === 'cli' && cliType) {
        provider = cliType === 'claude_code' ? 'claude_code_cli' : 'gemini_cli'
      } else if (llmProvider) {
        if (llmProvider === 'openai' || llmProvider === 'anthropic' || llmProvider === 'gemini') {
          provider = llmProvider
        }
      }

      // Only track usage if LLM was actually called (tokens > 0)
      if (provider && tokensUsed && tokensUsed > 0) {
        incrementLLMCallCount(provider)
        trackTokenUsage(provider, tokensUsed)
      }
    }
  }, [status?.status, status?.result, currentTaskId, trackTokenUsage, incrementLLMCallCount])

  // Invalidate documents cache when pipeline completes (only once per task)
  useEffect(() => {
    if (status?.status === 'completed' && status.result && currentTaskId) {
      // Only invalidate once per task
      if (documentsInvalidatedRef.current === currentTaskId) {
        return
      }
      documentsInvalidatedRef.current = currentTaskId

      // Invalidate documents cache so the Documents page shows the new document
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    }
  }, [status?.status, status?.result, currentTaskId, queryClient])

  useEffect(() => {
    if (!currentTaskId) {
      navigate('/generate')
    }
  }, [currentTaskId, navigate])

  if (!status) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const getStepIcon = (index: number, stepStatus: string) => {
    const Icon = stepIcons[index]
    if (stepStatus === 'completed') {
      return <CheckCircle2 className="h-6 w-6 text-green-500" />
    }
    if (stepStatus === 'running') {
      return <Loader2 className="h-6 w-6 text-primary animate-spin" />
    }
    if (stepStatus === 'failed') {
      return <XCircle className="h-6 w-6 text-red-500" />
    }
    if (stepStatus === 'skipped') {
      return <Icon className="h-6 w-6 text-gray-300" />
    }
    return <Icon className="h-6 w-6 text-gray-400" />
  }

  const getSkipReasonText = (reason: string): string => {
    const key = `skipReason.${reason}`
    const translated = t(key)
    return translated !== key ? translated : reason
  }

  const getStatusBadge = () => {
    switch (status.status) {
      case 'completed':
        return <Badge variant="success">{t('statusBadge.completed')}</Badge>
      case 'running':
        return <Badge variant="default">{t('statusBadge.running')}</Badge>
      case 'failed':
        return <Badge variant="destructive">{t('statusBadge.failed')}</Badge>
      case 'pending':
        return <Badge variant="secondary">{t('statusBadge.pending')}</Badge>
      case 'cancelled':
        return <Badge variant="outline">{t('statusBadge.cancelled')}</Badge>
      default:
        return <Badge variant="outline">{status.status}</Badge>
    }
  }

  const handleDownload = () => {
    if (status.result?.document_id) {
      window.open(getFullApiUrl(`/api/documents/${status.result.document_id}/download`), '_blank')
    }
  }

  const handleViewDocument = () => {
    if (status.result?.document_id) {
      navigate(`/documents/${status.result.document_id}`)
    }
  }

  const handleRetry = () => {
    reset()
    navigate('/generate')
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
        <div className="flex items-center justify-center gap-3">
          {getStatusBadge()}
          <span className="text-gray-500 dark:text-gray-400">{t('progressLabel', { progress: status.progress })}</span>
        </div>
      </div>

      <Progress value={status.progress} className="h-3" />

      {/* Pipeline Steps */}
      <Card>
        <CardHeader>
          <CardTitle>{t('sevenStepPipeline')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {status.steps.map((step, index) => (
              <div
                key={step.step_number}
                className={`flex items-center gap-4 p-4 rounded-lg ${
                  step.status === 'running'
                    ? 'bg-primary/5 border border-primary'
                    : step.status === 'completed'
                    ? 'bg-green-50 dark:bg-green-900/20'
                    : step.status === 'failed'
                    ? 'bg-red-50 dark:bg-red-900/20'
                    : step.status === 'skipped'
                    ? 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                    : 'bg-gray-50 dark:bg-gray-800/50'
                }`}
              >
                <div className="flex-shrink-0">
                  {getStepIcon(index, step.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      Step {step.step_number}: {step.step_name}
                    </span>
                    <div className="flex items-center gap-2">
                      {step.status === 'skipped' && step.skip_reason && (
                        <span className="text-xs text-gray-400">
                          ({getSkipReasonText(step.skip_reason)})
                        </span>
                      )}
                      <Badge
                        variant={
                          step.status === 'completed'
                            ? 'success'
                            : step.status === 'running'
                            ? 'default'
                            : step.status === 'failed'
                            ? 'destructive'
                            : step.status === 'skipped'
                            ? 'secondary'
                            : 'outline'
                        }
                      >
                        {t(`stepStatus.${step.status}`, step.status)}
                      </Badge>
                    </div>
                  </div>
                  {step.error && (
                    <p className="text-sm text-red-500 mt-1">{step.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Result */}
      {status.status === 'completed' && (
        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">{t('generationComplete.title')}</h3>
                {status.result ? (
                  <>
                    <p className="text-green-700 dark:text-green-300">
                      {String(status.result.document_name)}.{String(status.result.file_format)}
                    </p>
                    <p className="text-sm text-green-600 dark:text-green-400">
                      {t('generationComplete.time', { seconds: String(status.result.generation_time_seconds) })} · {t('generationComplete.projects', { count: Number(status.result.projects_processed) || 0 })}
                    </p>
                  </>
                ) : (
                  <p className="text-green-700 dark:text-green-300">{t('generationComplete.fallback')}</p>
                )}
              </div>
              {status.result && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleViewDocument}>
                    {t('common:preview')}
                  </Button>
                  <Button onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    {t('common:download')}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {status.status === 'failed' && (
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <XCircle className="h-12 w-12 text-red-500" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-100">{t('generationFailed.title')}</h3>
                <p className="text-red-700 dark:text-red-300">{status.error || t('generationFailed.unknown')}</p>
              </div>
              <Button variant="outline" onClick={handleRetry}>
                <RotateCcw className="h-4 w-4 mr-2" />
                {t('common:tryAgain')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connection Error - Polling stopped due to errors */}
      {pollingStopped && status.status !== 'completed' && status.status !== 'failed' && (
        <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <AlertTriangle className="h-12 w-12 text-yellow-500" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100">{t('connectionIssue.title')}</h3>
                <p className="text-yellow-700 dark:text-yellow-300">
                  {t('connectionIssue.description')}
                  {' '}{t('connectionIssue.failCount', { count: pollErrorCount })}
                </p>
                <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                  {t('connectionIssue.backgroundNote')}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setPollingStopped(false)
                  setPollErrorCount(0)
                  refetch()
                }}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                {t('connectionIssue.reconnect')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-center gap-4">
        {status.status === 'completed' && (
          <Button variant="outline" onClick={handleRetry}>
            {t('newGeneration')}
          </Button>
        )}
        <Button variant="ghost" onClick={() => navigate('/documents')}>
          {t('goToDocuments')}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}
