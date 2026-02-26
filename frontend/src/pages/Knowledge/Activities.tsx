import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VolunteerActivitiesTab } from './CredentialTabs/VolunteerActivitiesTab'
import { ScrollToTop } from '@/components/ScrollToTop'
import { Heart, Users, Plus, ArrowUpDown } from 'lucide-react'
import { useUserStore } from '@/stores/userStore'
import { volunteerActivitiesApi } from '@/api/credentials'
import { SortOption, SORT_OPTIONS } from '@/hooks/useSortableList'

type SubTab = 'volunteer' | 'external'

export default function ActivitiesPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<SubTab>('volunteer')
  const [createTrigger, setCreateTrigger] = useState(0)
  const [sortStates, setSortStates] = useState<Record<SubTab, SortOption>>({
    volunteer: 'dateDesc',
    external: 'dateDesc',
  })
  const { user } = useUserStore()

  // Fetch counts
  const { data: activitiesData } = useQuery({
    queryKey: ['volunteer_activities', user?.id],
    queryFn: () => volunteerActivitiesApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  if (!user) return null

  const allActivities = activitiesData?.data || []
  const volunteerCount = allActivities.filter((a) => a.activity_type === 'volunteer').length
  const externalCount = allActivities.filter((a) => a.activity_type === 'external').length

  const currentSortBy = sortStates[activeTab]

  const handleSortChange = (value: SortOption) => {
    setSortStates(prev => ({ ...prev, [activeTab]: value }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('credentials:activities.title')}</h1>
          <p className="text-muted-foreground">{t('credentials:activities.subtitle')}</p>
        </div>
        <Button onClick={() => setCreateTrigger(c => c + 1)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('common:add')}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SubTab)}>
        <div className="flex items-center justify-between gap-4">
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
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <Select value={currentSortBy} onValueChange={(v) => handleSortChange(v as SortOption)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dateDesc">{t(SORT_OPTIONS.dateDesc)}</SelectItem>
                <SelectItem value="dateAsc">{t(SORT_OPTIONS.dateAsc)}</SelectItem>
                <SelectItem value="nameAsc">{t(SORT_OPTIONS.nameAsc)}</SelectItem>
                <SelectItem value="nameDesc">{t(SORT_OPTIONS.nameDesc)}</SelectItem>
                <SelectItem value="manual">{t(SORT_OPTIONS.manual)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="volunteer" className="mt-4">
          <VolunteerActivitiesTab activityType="volunteer" createTrigger={createTrigger} sortBy={currentSortBy} />
        </TabsContent>
        <TabsContent value="external" className="mt-4">
          <VolunteerActivitiesTab activityType="external" createTrigger={createTrigger} sortBy={currentSortBy} />
        </TabsContent>
      </Tabs>

      <ScrollToTop />
    </div>
  )
}
