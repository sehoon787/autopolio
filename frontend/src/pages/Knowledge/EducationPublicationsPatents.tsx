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
import { AcademicEducationTab } from './CredentialTabs/AcademicEducationTab'
import { TrainingsTab } from './CredentialTabs/TrainingsTab'
import { PublicationsTab } from './CredentialTabs/PublicationsTab'
import { PatentsTab } from './CredentialTabs/PatentsTab'
import { CredentialTimeline, TimelineItem } from './CredentialTabs/CredentialTimeline'
import { ScrollToTop } from '@/components/ScrollToTop'
import { GraduationCap, BookOpen, FileText, ScrollText, Plus, ArrowUpDown, Info, List, Clock } from 'lucide-react'
import { useUserStore } from '@/stores/userStore'
import { educationsApi, publicationsApi } from '@/api/credentials'
import { formatDate } from '@/lib/utils'
import { SortOption, SORT_OPTIONS } from '@/hooks/useSortableList'

// Academic degree types
const ACADEMIC_DEGREES = ['high_school', 'associate', 'bachelor', 'master', 'doctorate']
// Training types
const TRAINING_TYPES = ['certificate', 'bootcamp', 'course', 'workshop', 'other']

type SubTab = 'academic' | 'trainings' | 'publications' | 'patents'

export default function EducationPublicationsPatentsPage() {
  const { t } = useTranslation()
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list')
  const [activeTab, setActiveTab] = useState<SubTab>('academic')
  const [createTrigger, setCreateTrigger] = useState(0)
  const [sortStates, setSortStates] = useState<Record<SubTab, SortOption>>({
    academic: 'dateDesc',
    trainings: 'dateDesc',
    publications: 'dateDesc',
    patents: 'dateDesc',
  })
  const { user } = useUserStore()

  // Fetch counts
  const { data: educationsData } = useQuery({
    queryKey: ['educations', user?.id],
    queryFn: () => educationsApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const { data: publicationsData } = useQuery({
    queryKey: ['publications', user?.id],
    queryFn: () => publicationsApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  if (!user) return null

  // Split education counts
  const allEducations = educationsData?.data || []
  const academicCount = allEducations.filter(
    (e) => ACADEMIC_DEGREES.includes(e.degree || '') || !e.degree
  ).length
  const trainingsCount = allEducations.filter((e) =>
    TRAINING_TYPES.includes(e.degree || '')
  ).length

  // Split publications counts
  const allPublications = publicationsData?.data || []
  const publicationsCount = allPublications.filter((p) => p.publication_type !== 'patent').length
  const patentsCount = allPublications.filter((p) => p.publication_type === 'patent').length

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
    const academicDegrees = new Set(ACADEMIC_DEGREES)

    for (const e of allEducations) {
      const isAcademic = academicDegrees.has(e.degree || '') || !e.degree
      const dateEnd = e.is_current ? t('credentials:timeline.present') : formatDate(e.end_date)
      const dateLabel = `${formatDate(e.start_date)}${dateEnd ? ` ~ ${dateEnd}` : ''}`

      items.push({
        id: e.id,
        kind: isAcademic ? 'academic' : 'training',
        title: e.school_name,
        subtitle: e.major ? `${e.major}${e.degree ? ` (${t(`credentials:educations.degrees.${e.degree === 'high_school' ? 'highSchool' : e.degree}`, e.degree)})` : ''}` : null,
        dateLabel,
        sortDate: e.start_date || '0000-01-01',
        isCurrent: e.is_current,
        badge: e.graduation_status ? t(`credentials:academicEducation.graduationStatus.${e.graduation_status}`, e.graduation_status) : null,
        url: e.school_web_page,
        description: e.description,
      })
    }

    for (const p of allPublications) {
      const isPatent = p.publication_type === 'patent'
      const dateParts = (p.publication_date || '').split('|')
      const sortDate = dateParts[0] || '0000-01-01'

      items.push({
        id: p.id,
        kind: isPatent ? 'patent' : 'publication',
        title: p.title,
        subtitle: isPatent ? p.publisher : (p.authors ? `${p.authors}` : p.publisher),
        dateLabel: formatDate(sortDate),
        sortDate,
        isCurrent: false,
        badge: isPatent && p.doi ? t(`credentials:patents.status.${(p.doi.split('|')[2] || '')}`, p.doi.split('|')[2] || '') : null,
        url: p.url,
        description: p.description,
      })
    }

    return items.sort((a, b) => b.sortDate.localeCompare(a.sortDate))
  }, [allEducations, allPublications, t])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('credentials:educationPublicationsPatents.title')}</h1>
          <p className="text-muted-foreground">{t('credentials:educationPublicationsPatents.subtitle')}</p>
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
              <TabsTrigger value="academic" className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                {t('credentials:tabs.academicEducation')}
                {academicCount > 0 && ` (${academicCount})`}
              </TabsTrigger>
              <TabsTrigger value="trainings" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                {t('credentials:tabs.trainings')}
                {trainingsCount > 0 && ` (${trainingsCount})`}
              </TabsTrigger>
              <TabsTrigger value="publications" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {t('credentials:tabs.publications')}
                {publicationsCount > 0 && ` (${publicationsCount})`}
              </TabsTrigger>
              <TabsTrigger value="patents" className="flex items-center gap-2">
                <ScrollText className="h-4 w-4" />
                {t('credentials:tabs.patents')}
                {patentsCount > 0 && ` (${patentsCount})`}
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

          <TabsContent value="academic" className="mt-4">
            <AcademicEducationTab createTrigger={createTrigger} sortBy={currentSortBy} />
          </TabsContent>
          <TabsContent value="trainings" className="mt-4">
            <TrainingsTab createTrigger={createTrigger} sortBy={currentSortBy} />
          </TabsContent>
          <TabsContent value="publications" className="mt-4">
            <PublicationsTab createTrigger={createTrigger} sortBy={currentSortBy} />
          </TabsContent>
          <TabsContent value="patents" className="mt-4">
            <PatentsTab createTrigger={createTrigger} sortBy={currentSortBy} />
          </TabsContent>
        </Tabs>
      )}

      <ScrollToTop />
    </div>
  )
}
