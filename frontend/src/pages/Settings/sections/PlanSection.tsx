import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Crown, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { usePlanStore } from '@/stores/planStore'
import { useUserStore } from '@/stores/userStore'
import { isElectron } from '@/lib/electron'

export default function PlanSection() {
  const { t } = useTranslation('common')
  const { t: tSettings } = useTranslation('settings')
  const { tier, limits, usage, isLoading, fetchPlan } = usePlanStore()
  const { user } = useUserStore()

  useEffect(() => {
    if (user?.id) {
      fetchPlan(user.id)
    }
  }, [user?.id, fetchPlan])

  if (isElectron()) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{tSettings('sidebar.plan')}</h2>
          <p className="text-sm text-muted-foreground">{t('plan.desktopUnlimited')}</p>
        </div>
      </div>
    )
  }

  const projectPercent = limits?.max_projects
    ? Math.min(((usage?.projects ?? 0) / limits.max_projects) * 100, 100)
    : 0
  const llmPercent = limits?.max_llm_calls_per_month
    ? Math.min(((usage?.llm_calls_this_month ?? 0) / limits.max_llm_calls_per_month) * 100, 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">{tSettings('sidebar.plan')}</h2>
        <p className="text-sm text-muted-foreground">{t('plan.description')}</p>
      </div>

      {/* Current tier */}
      <div className="flex items-center gap-3">
        <Crown className="h-5 w-5 text-primary" />
        <span className="font-medium">{t('plan.currentPlan')}</span>
        <Badge variant="default">{t(`plan.${tier}`)}</Badge>
      </div>

      {/* Usage stats */}
      {!isLoading && limits && usage && (
        <div className="space-y-4">
          {/* Projects */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span>{t('plan.projects')}</span>
              <span className="text-muted-foreground">
                {limits.max_projects
                  ? `${usage.projects} / ${limits.max_projects}`
                  : `${usage.projects} / ${t('plan.unlimited')}`}
              </span>
            </div>
            {limits.max_projects && (
              <Progress value={projectPercent} className="h-2" />
            )}
          </div>

          {/* AI Analysis */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span>{t('plan.aiAnalysis')}</span>
              <span className="text-muted-foreground">
                {limits.max_llm_calls_per_month
                  ? `${usage.llm_calls_this_month} / ${limits.max_llm_calls_per_month}`
                  : `${usage.llm_calls_this_month} / ${t('plan.unlimited')}`}
              </span>
            </div>
            {limits.max_llm_calls_per_month && (
              <Progress value={llmPercent} className="h-2" />
            )}
            <p className="text-xs text-muted-foreground">{t('plan.usageReset')}</p>
          </div>

          {/* Export formats */}
          <div className="space-y-1.5">
            <span className="text-sm">{t('plan.exportFormats')}</span>
            <div className="flex gap-2">
              {limits.allowed_export_formats.map((fmt: string) => (
                <Badge key={fmt} variant="secondary">
                  {fmt.toUpperCase()}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      )}

      {/* Link to pricing */}
      <Button variant="outline" asChild>
        <Link to="/pricing" className="inline-flex items-center gap-2">
          {t('plan.viewPricing')}
          <ExternalLink className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  )
}
