import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useUserStore } from '@/stores/userStore'
import { pipelineApi } from '@/api/pipeline'
import { formatDateTime } from '@/lib/utils'
import { History, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'

export default function HistoryPage() {
  const { user } = useUserStore()

  const { data: jobsData, isLoading } = useQuery({
    queryKey: ['jobs', user?.id],
    queryFn: () => pipelineApi.getJobs(user!.id, { limit: 50 }),
    enabled: !!user?.id,
    refetchInterval: 5000, // Refresh every 5 seconds for running jobs
  })

  const jobs = jobsData?.data?.jobs || []

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'running':
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />
      case 'pending':
        return <Clock className="h-5 w-5 text-gray-400" />
      default:
        return <Clock className="h-5 w-5 text-gray-400" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success">완료</Badge>
      case 'failed':
        return <Badge variant="destructive">실패</Badge>
      case 'running':
        return <Badge variant="default">실행 중</Badge>
      case 'pending':
        return <Badge variant="secondary">대기 중</Badge>
      case 'cancelled':
        return <Badge variant="outline">취소됨</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getJobTypeLabel = (type: string) => {
    switch (type) {
      case 'pipeline':
        return '문서 생성 파이프라인'
      case 'github_analysis':
        return 'GitHub 분석'
      case 'document_generation':
        return '문서 생성'
      default:
        return type
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">작업 이력</h1>
        <p className="text-gray-600">실행된 작업들의 이력을 확인합니다.</p>
      </div>

      {isLoading ? (
        <div className="text-center py-8">로딩 중...</div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <History className="h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">작업 이력이 없습니다</h3>
            <p className="text-gray-500">문서 생성이나 레포지토리 분석을 실행하면 여기에 표시됩니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1">
                    {getStatusIcon(job.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold">{getJobTypeLabel(job.job_type)}</span>
                      {getStatusBadge(job.status)}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-500">
                      <div>
                        <span className="block text-xs">시작</span>
                        <span>{job.started_at ? formatDateTime(job.started_at) : '-'}</span>
                      </div>
                      <div>
                        <span className="block text-xs">완료</span>
                        <span>{job.completed_at ? formatDateTime(job.completed_at) : '-'}</span>
                      </div>
                      <div>
                        <span className="block text-xs">진행 단계</span>
                        <span>{job.current_step}/{job.total_steps}</span>
                      </div>
                      {job.step_name && (
                        <div>
                          <span className="block text-xs">현재 작업</span>
                          <span>{job.step_name}</span>
                        </div>
                      )}
                    </div>
                    {job.status === 'running' && (
                      <div className="mt-3">
                        <Progress value={job.progress} className="h-2" />
                        <span className="text-xs text-gray-500">{job.progress}%</span>
                      </div>
                    )}
                    {job.error_message && (
                      <p className="text-sm text-red-500 mt-3">{job.error_message}</p>
                    )}
                    {job.output_data?.document_id !== undefined && (
                      <p className="text-sm text-gray-500 mt-3">
                        생성된 문서 ID: {String(job.output_data.document_id)}
                      </p>
                    )}
                  </div>
                  <div className="text-sm text-gray-400">
                    {formatDateTime(job.created_at)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
