import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { RefreshCw } from 'lucide-react'

export function LoadingPhaseCard() {
  const { t } = useTranslation('github')
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 3000),
      setTimeout(() => setPhase(2), 8000),
      setTimeout(() => setPhase(3), 15000),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  const messages = [
    t('loadingRepos'),
    t('loadingReposFetchingOrgs'),
    t('loadingReposProcessing'),
    t('loadingReposAlmostDone'),
  ]

  return (
    <Card>
      <CardContent className="py-12 text-center">
        <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400 mb-4" />
        <p className="text-gray-500">{messages[phase]}</p>
        <p className="text-xs text-gray-400 mt-2">{t('loadingReposHint')}</p>
      </CardContent>
    </Card>
  )
}
