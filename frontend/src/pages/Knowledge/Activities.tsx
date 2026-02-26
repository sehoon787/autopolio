import { useState, useMemo } from 'react'
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
import { CredentialTimeline, TimelineItem } from './CredentialTabs/CredentialTimeline'
import { ScrollToTop } from '@/components/ScrollToTop'
import { Heart, Users, Plus, ArrowUpDown, Info, List, Clock } from 'lucide-react'
import { useUserStore } from '@/stores/userStore'
import { volunteerActivitiesApi } from '@/api/credentials'
import { formatDate } from '@/lib/utils'
import { SortOption, SORT_OPTIONS } from '@/hooks/useSortableList'

type SubTab = 'volunteer' | 'external'

export default function ActivitiesPage() {
  const { t } = useTranslation()
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list')
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

  const handleAddClick = () => {
    if (viewMode === 'timeline') setViewMode('list')
    setCreateTrigger(c => c + 1)
  }

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = []
    for (const a of allActivities) {
      const kind = a.activity_type === 'external' ? 'external' as const : 'volunteer' as const
      const dateEnd = a.is_current ? t('credentials:timeline.present') : formatDate(a.end_date)
      const dateLabel = `${formatDate(a.start_date)}${dateEnd ? ` ~ ${dateEnd}` : ''}`

      items.push({
        id: a.id,
        kind,
        title: a.name,
        subtitle: a.organization,
        dateLabel,
        sortDate: a.start_date || '0000-01-01',
        isCurrent: a.is_current,
        badge: a.role,
        url: a.certificate_url,
        description: a.description,
      })
    }
    return items.sort((a, b) => b.sortDate.localeCompare(a.sortDate))
  }, [allActivities, t])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('credentials:activities.title')}</h1>
          <p className="text-muted-foreground">{t('credentials:activities.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-lg overflow-hidden">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-none"
            >
              <List className="h-4 w-4 mr-1.5" />
              {t('credentials:view.list')}
            </Button>
            <Button
              variant={viewMode === 'timeline' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('timeline')}
              className="rounded-none"
            >
              <Clock className="h-4 w-4 mr-1.5" />
              {t('credentials:view.timeline')}
            </Button>
          </div>
          <Button onClick={handleAddClick}>
            <Plus className="h-4 w-4 mr-2" />
            {t('common:add')}
          </Button>
        </div>
      </div>

      {viewMode === 'timeline' ? (
        <CredentialTimeline items={timelineItems} />
      ) : (
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
            <div className="flex flex-col items-end gap-2">
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
              {currentSortBy === 'manual' && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  {t('credentials:sort.manualHint')}
                </p>
              )}
            </div>
          </div>

          <TabsContent value="volunteer" className="mt-4">
            <VolunteerActivitiesTab activityType="volunteer" createTrigger={createTrigger} sortBy={currentSortBy} />
          </TabsContent>
          <TabsContent value="external" className="mt-4">
            <VolunteerActivitiesTab activityType="external" createTrigger={createTrigger} sortBy={currentSortBy} />
          </TabsContent>
        </Tabs>
      )}

      <ScrollToTop />
    </div>
  )
}
