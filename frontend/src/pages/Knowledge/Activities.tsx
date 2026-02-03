import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VolunteerActivitiesTab } from './CredentialTabs/VolunteerActivitiesTab'
import { ScrollToTop } from '@/components/ScrollToTop'
import { Heart, Users } from 'lucide-react'
import { useUserStore } from '@/stores/userStore'
import { volunteerActivitiesApi } from '@/api/credentials'

type SubTab = 'volunteer' | 'external'

export default function ActivitiesPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<SubTab>('volunteer')
  const { user } = useUserStore()

  // Fetch counts
  const { data: activitiesData } = useQuery({
    queryKey: ['volunteer_activities', user?.id],
    queryFn: () => volunteerActivitiesApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const allActivities = activitiesData?.data || []
  const volunteerCount = allActivities.filter((a) => a.activity_type === 'volunteer').length
  const externalCount = allActivities.filter((a) => a.activity_type === 'external').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('credentials:activities.title')}</h1>
        <p className="text-muted-foreground">{t('credentials:activities.subtitle')}</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SubTab)}>
        <TabsList>
          <TabsTrigger value="volunteer" className="flex items-center gap-2">
            <Heart className="h-4 w-4" />
            {t('credentials:tabs.volunteerActivities')}
            {volunteerCount > 0 && ` (${volunteerCount})`}
          </TabsTrigger>
          <TabsTrigger value="external" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('credentials:tabs.externalActivities')}
            {externalCount > 0 && ` (${externalCount})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="volunteer" className="mt-4">
          <VolunteerActivitiesTab activityType="volunteer" />
        </TabsContent>
        <TabsContent value="external" className="mt-4">
          <VolunteerActivitiesTab activityType="external" />
        </TabsContent>
      </Tabs>

      <ScrollToTop />
    </div>
  )
}
