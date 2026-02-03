import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CertificationsTab } from './CredentialTabs/CertificationsTab'
import { AwardsTab } from './CredentialTabs/AwardsTab'
import { ScrollToTop } from '@/components/ScrollToTop'
import { Medal, Award } from 'lucide-react'
import { useUserStore } from '@/stores/userStore'
import { certificationsApi, awardsApi } from '@/api/credentials'

type SubTab = 'certifications' | 'awards'

export default function CertificationsAwardsPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<SubTab>('certifications')
  const { user } = useUserStore()

  // Fetch counts
  const { data: certificationsData } = useQuery({
    queryKey: ['certifications', user?.id],
    queryFn: () => certificationsApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const { data: awardsData } = useQuery({
    queryKey: ['awards', user?.id],
    queryFn: () => awardsApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const certificationsCount = certificationsData?.data?.length ?? 0
  const awardsCount = awardsData?.data?.length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('credentials:certificationsAwards.title')}</h1>
        <p className="text-muted-foreground">{t('credentials:certificationsAwards.subtitle')}</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SubTab)}>
        <TabsList>
          <TabsTrigger value="certifications" className="flex items-center gap-2">
            <Medal className="h-4 w-4" />
            {t('credentials:tabs.certifications')}
            {certificationsCount > 0 && ` (${certificationsCount})`}
          </TabsTrigger>
          <TabsTrigger value="awards" className="flex items-center gap-2">
            <Award className="h-4 w-4" />
            {t('credentials:tabs.awards')}
            {awardsCount > 0 && ` (${awardsCount})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="certifications" className="mt-4">
          <CertificationsTab />
        </TabsContent>
        <TabsContent value="awards" className="mt-4">
          <AwardsTab />
        </TabsContent>
      </Tabs>

      <ScrollToTop />
    </div>
  )
}
