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
import { CertificationsTab } from './CredentialTabs/CertificationsTab'
import { AwardsTab } from './CredentialTabs/AwardsTab'
import { CredentialTimeline, TimelineItem } from './CredentialTabs/CredentialTimeline'
import { ScrollToTop } from '@/components/ScrollToTop'
import { IdCard, Trophy, Plus, ArrowUpDown, Info, List, Clock } from 'lucide-react'
import { useUserStore } from '@/stores/userStore'
import { certificationsApi, awardsApi } from '@/api/credentials'
import { formatDate } from '@/lib/utils'
import { SortOption, SORT_OPTIONS } from '@/hooks/useSortableList'

type SubTab = 'certifications' | 'awards'

export default function CertificationsAwardsPage() {
  const { t } = useTranslation()
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list')
  const [activeTab, setActiveTab] = useState<SubTab>('certifications')
  const [createTrigger, setCreateTrigger] = useState(0)
  const [sortStates, setSortStates] = useState<Record<SubTab, SortOption>>({
    certifications: 'dateDesc',
    awards: 'dateDesc',
  })
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

  if (!user) return null

  const certificationsCount = certificationsData?.data?.length ?? 0
  const awardsCount = awardsData?.data?.length ?? 0

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
    for (const c of certificationsData?.data || []) {
      items.push({
        id: c.id,
        kind: 'certification',
        title: c.name,
        subtitle: c.issuer,
        dateLabel: formatDate(c.issue_date),
        sortDate: c.issue_date || '0000-01-01',
        isCurrent: false,
        badge: null,
        url: c.credential_url,
        description: c.description,
      })
    }
    for (const a of awardsData?.data || []) {
      items.push({
        id: a.id,
        kind: 'award',
        title: a.name,
        subtitle: a.issuer,
        dateLabel: formatDate(a.award_date),
        sortDate: a.award_date || '0000-01-01',
        isCurrent: false,
        badge: null,
        url: a.award_url,
        description: a.description,
      })
    }
    return items.sort((a, b) => b.sortDate.localeCompare(a.sortDate))
  }, [certificationsData, awardsData])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('credentials:certificationsAwards.title')}</h1>
          <p className="text-muted-foreground">{t('credentials:certificationsAwards.subtitle')}</p>
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
              <TabsTrigger value="certifications" className="flex items-center gap-2">
                <IdCard className="h-4 w-4" />
                {t('credentials:tabs.certifications')}
                {certificationsCount > 0 && ` (${certificationsCount})`}
              </TabsTrigger>
              <TabsTrigger value="awards" className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                {t('credentials:tabs.awards')}
                {awardsCount > 0 && ` (${awardsCount})`}
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

          <TabsContent value="certifications" className="mt-4">
            <CertificationsTab createTrigger={createTrigger} sortBy={currentSortBy} />
          </TabsContent>
          <TabsContent value="awards" className="mt-4">
            <AwardsTab createTrigger={createTrigger} sortBy={currentSortBy} />
          </TabsContent>
        </Tabs>
      )}

      <ScrollToTop />
    </div>
  )
}
