import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useUserStore } from '@/stores/userStore'
import { pipelineApi } from '@/api/pipeline'
import { formatDateTime } from '@/lib/utils'
import { History, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'

export default function HistoryPage() {
  const { t } = useTranslation('history')
  const { t: tc } = useTranslation('common')
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
        return <Badge variant="success">{t('status.completed')}</Badge>
      case 'failed':
        return <Badge variant="destructive">{t('status.failed')}</Badge>
      case 'running':
        return <Badge variant="default">{t('status.running')}</Badge>
      case 'pending':
        return <Badge variant="secondary">{t('status.pending')}</Badge>
      case 'cancelled':
        return <Badge variant="outline">{t('status.cancelled')}</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getJobTypeLabel = (type: string) => {
    const key = `jobTypes.${type}` as const
    const translated = t(key)
    return translated === key ? type : translated
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-gray-600 dark:text-gray-400">{t('subtitle')}</p>
      </div>

      {isLoading ? (
        <div className="text-center py-8">{tc('loading')}</div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <History className="h-16 w-16 text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('noJobs')}</h3>
            <p className="text-gray-500 dark:text-gray-400">{t('noJobsDesc')}</p>
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <div>
                        <span className="block text-xs">{t('fields.started')}</span>
                        <span>{job.started_at ? formatDateTime(job.started_at) : '-'}</span>
                      </div>
                      <div>
                        <span className="block text-xs">{t('fields.completed')}</span>
                        <span>{job.completed_at ? formatDateTime(job.completed_at) : '-'}</span>
                      </div>
                      <div>
                        <span className="block text-xs">{t('fields.currentStep')}</span>
                        <span>{job.current_step}/{job.total_steps}</span>
                      </div>
                      {job.step_name && (
                        <div>
                          <span className="block text-xs">{t('fields.currentTask')}</span>
                          <span>{job.step_name}</span>
                        </div>
                      )}
                    </div>
                    {job.status === 'running' && (
                      <div className="mt-3">
                        <Progress value={job.progress} className="h-2" />
                        <span className="text-xs text-gray-500 dark:text-gray-400">{job.progress}%</span>
                      </div>
                    )}
                    {job.error_message && (
                      <p className="text-sm text-red-500 mt-3">{job.error_message}</p>
                    )}
                    {job.output_data?.document_id !== undefined && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                        {t('fields.generatedDocId')} {String(job.output_data.document_id)}
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
