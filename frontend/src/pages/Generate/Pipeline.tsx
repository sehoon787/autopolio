import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { usePipelineStore } from '@/stores/pipelineStore'
import { useUsageStore, LLMUsage } from '@/stores/usageStore'
import { pipelineApi } from '@/api/pipeline'
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
} from 'lucide-react'

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
  const { currentTaskId, status, setStatus, reset } = usePipelineStore()
  const { trackTokenUsage, incrementLLMCallCount } = useUsageStore()
  const usageTrackedRef = useRef<string | null>(null) // Track which task's usage has been recorded

  const { data: statusData } = useQuery({
    queryKey: ['pipeline-status', currentTaskId],
    queryFn: () => pipelineApi.getStatus(currentTaskId!),
    enabled: !!currentTaskId,
    refetchInterval: (query) => {
      const data = query.state.data?.data
      if (data?.status === 'running' || data?.status === 'pending') {
        return 1000 // Poll every second while running
      }
      return false
    },
  })

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

      if (tokensUsed && tokensUsed > 0) {
        // Determine which provider to track
        let provider: keyof LLMUsage | null = null
        if (executionMode === 'cli' && cliType) {
          provider = cliType === 'claude_code' ? 'claude_code_cli' : 'gemini_cli'
        } else if (llmProvider) {
          if (llmProvider === 'openai' || llmProvider === 'anthropic' || llmProvider === 'gemini') {
            provider = llmProvider
          }
        }

        if (provider) {
          trackTokenUsage(provider, tokensUsed)
          incrementLLMCallCount(provider)
        }
      }
    }
  }, [status?.status, status?.result, currentTaskId, trackTokenUsage, incrementLLMCallCount])

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

  const getStatusBadge = () => {
    switch (status.status) {
      case 'completed':
        return <Badge variant="success">완료</Badge>
      case 'running':
        return <Badge variant="default">실행 중</Badge>
      case 'failed':
        return <Badge variant="destructive">실패</Badge>
      case 'pending':
        return <Badge variant="secondary">대기 중</Badge>
      case 'cancelled':
        return <Badge variant="outline">취소됨</Badge>
      default:
        return <Badge variant="outline">{status.status}</Badge>
    }
  }

  const handleDownload = () => {
    if (status.result?.document_id) {
      window.open(`/api/documents/${status.result.document_id}/download`, '_blank')
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
        <h1 className="text-3xl font-bold mb-2">문서 생성 파이프라인</h1>
        <div className="flex items-center justify-center gap-3">
          {getStatusBadge()}
          <span className="text-gray-500">진행률: {status.progress}%</span>
        </div>
      </div>

      <Progress value={status.progress} className="h-3" />

      {/* Pipeline Steps */}
      <Card>
        <CardHeader>
          <CardTitle>7단계 파이프라인</CardTitle>
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
                    ? 'bg-green-50'
                    : step.status === 'failed'
                    ? 'bg-red-50'
                    : 'bg-gray-50'
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
                    <Badge
                      variant={
                        step.status === 'completed'
                          ? 'success'
                          : step.status === 'running'
                          ? 'default'
                          : step.status === 'failed'
                          ? 'destructive'
                          : 'outline'
                      }
                    >
                      {step.status === 'completed' ? '완료' :
                       step.status === 'running' ? '진행중' :
                       step.status === 'failed' ? '실패' :
                       step.status === 'skipped' ? '건너뜀' : '대기'}
                    </Badge>
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
      {status.status === 'completed' && status.result && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-green-900">문서 생성 완료!</h3>
                <p className="text-green-700">
                  {String(status.result.document_name)}.{String(status.result.file_format)}
                </p>
                <p className="text-sm text-green-600">
                  생성 시간: {String(status.result.generation_time_seconds)}초 ·
                  {String(status.result.projects_processed)}개 프로젝트 처리됨
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleViewDocument}>
                  미리보기
                </Button>
                <Button onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  다운로드
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {status.status === 'failed' && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <XCircle className="h-12 w-12 text-red-500" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-900">생성 실패</h3>
                <p className="text-red-700">{status.error || '알 수 없는 오류가 발생했습니다.'}</p>
              </div>
              <Button variant="outline" onClick={handleRetry}>
                <RotateCcw className="h-4 w-4 mr-2" />
                다시 시도
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-center gap-4">
        {status.status === 'completed' && (
          <Button variant="outline" onClick={handleRetry}>
            새 문서 생성
          </Button>
        )}
        <Button variant="ghost" onClick={() => navigate('/documents')}>
          생성 문서 목록으로
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}
