import { useTranslation } from 'react-i18next'
import { Check, X, Crown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePlanStore } from '@/stores/planStore'
import { USER_TIERS, type UserTierType } from '@/constants/enums'
import { isElectron } from '@/lib/electron'

interface TierInfo {
  id: UserTierType
  price: string
  features: {
    projects: string
    reposPerProject: string
    aiAnalysis: string
    exportMd: boolean
    exportDocx: boolean
    exportHtml: boolean
    exportPdf: boolean
  }
}

export default function PricingPage() {
  const { t } = useTranslation('common')
  const { tier: currentTier } = usePlanStore()

  if (isElectron()) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16 space-y-4">
        <Crown className="h-12 w-12 mx-auto text-primary" />
        <h1 className="text-2xl font-bold">{t('plan.allFeatures')}</h1>
        <p className="text-muted-foreground">{t('plan.desktopUnlimited')}</p>
      </div>
    )
  }

  const tiers: TierInfo[] = [
    {
      id: USER_TIERS.FREE,
      price: t('plan.free'),
      features: {
        projects: '3',
        reposPerProject: '1',
        aiAnalysis: '10',
        exportMd: true,
        exportDocx: false,
        exportHtml: false,
        exportPdf: false,
      },
    },
    {
      id: USER_TIERS.PRO,
      price: t('plan.comingSoon'),
      features: {
        projects: '20',
        reposPerProject: '5',
        aiAnalysis: '200',
        exportMd: true,
        exportDocx: true,
        exportHtml: true,
        exportPdf: false,
      },
    },
    {
      id: USER_TIERS.ENTERPRISE,
      price: t('plan.comingSoon'),
      features: {
        projects: t('plan.unlimited'),
        reposPerProject: t('plan.unlimited'),
        aiAnalysis: t('plan.unlimited'),
        exportMd: true,
        exportDocx: true,
        exportHtml: true,
        exportPdf: true,
      },
    },
  ]

  const featureRows: { label: string; key: keyof TierInfo['features'] }[] = [
    { label: t('plan.projects'), key: 'projects' },
    { label: t('plan.reposPerProject'), key: 'reposPerProject' },
    { label: `${t('plan.aiAnalysis')} ${t('plan.perMonth')}`, key: 'aiAnalysis' },
    { label: 'Markdown', key: 'exportMd' },
    { label: 'DOCX', key: 'exportDocx' },
    { label: 'HTML', key: 'exportHtml' },
    { label: 'PDF', key: 'exportPdf' },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">{t('plan.viewPricing')}</h1>
        <p className="text-muted-foreground">{t('plan.description')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((tier) => {
          const isCurrent = tier.id === currentTier
          return (
            <Card
              key={tier.id}
              className={isCurrent ? 'border-primary ring-2 ring-primary/20' : ''}
            >
              <CardHeader className="text-center space-y-2">
                <CardTitle className="flex items-center justify-center gap-2">
                  {t(`plan.${tier.id}`)}
                  {isCurrent && (
                    <Badge variant="default">{t('plan.current')}</Badge>
                  )}
                </CardTitle>
                <p className="text-2xl font-bold">{tier.price}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {featureRows.map((row) => {
                    const value = tier.features[row.key]
                    const isBoolean = typeof value === 'boolean'
                    return (
                      <div key={row.key} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{row.label}</span>
                        {isBoolean ? (
                          value ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground/40" />
                          )
                        ) : (
                          <span className="font-medium">{value}</span>
                        )}
                      </div>
                    )
                  })}
                </div>

                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    {t('plan.current')}
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    {t('plan.comingSoon')}
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
