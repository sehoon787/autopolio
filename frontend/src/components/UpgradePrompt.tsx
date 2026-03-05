import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Lock } from 'lucide-react'
import { usePlanStore } from '@/stores/planStore'
import { USER_TIERS } from '@/constants/enums'

interface UpgradePromptProps {
  /** Which limit was hit: 'project' | 'llm' | 'export' */
  type: 'project' | 'llm' | 'export'
  /** For export: which format is locked */
  lockedFormat?: string
}

export function UpgradePrompt({ type, lockedFormat }: UpgradePromptProps) {
  const { t } = useTranslation('common')
  const { tier, limits, usage } = usePlanStore()

  const tierLabel = t(`plan.${tier}`)
  const nextTier = tier === USER_TIERS.FREE ? t('plan.pro') : t('plan.enterprise')

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-amber-600" />
          <span className="font-medium text-amber-800">{t('plan.limitReached')}</span>
          <Badge variant="outline" className="text-amber-700 border-amber-300">
            {tierLabel}
          </Badge>
        </div>

        {type === 'project' && limits && usage && (
          <div className="space-y-1">
            <p className="text-sm text-amber-700">
              {t('plan.projectLimit', { current: usage.projects, max: limits.max_projects })}
            </p>
            <Progress
              value={limits.max_projects ? (usage.projects / limits.max_projects) * 100 : 100}
              className="h-2"
            />
          </div>
        )}

        {type === 'llm' && limits && usage && (
          <div className="space-y-1">
            <p className="text-sm text-amber-700">
              {t('plan.llmLimit', { current: usage.llm_calls_this_month, max: limits.max_llm_calls_per_month })}
            </p>
            <Progress
              value={limits.max_llm_calls_per_month ? (usage.llm_calls_this_month / limits.max_llm_calls_per_month) * 100 : 100}
              className="h-2"
            />
            <p className="text-xs text-amber-600">{t('plan.usageReset')}</p>
          </div>
        )}

        {type === 'export' && lockedFormat && (
          <p className="text-sm text-amber-700">
            {t('plan.exportLocked', { tier: nextTier })}
          </p>
        )}

        <p className="text-sm font-medium text-amber-800">
          {t('plan.upgrade')} → {nextTier}
        </p>
      </CardContent>
    </Card>
  )
}
