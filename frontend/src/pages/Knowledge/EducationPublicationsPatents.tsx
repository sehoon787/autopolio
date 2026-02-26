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
import { AcademicEducationTab } from './CredentialTabs/AcademicEducationTab'
import { TrainingsTab } from './CredentialTabs/TrainingsTab'
import { PublicationsTab } from './CredentialTabs/PublicationsTab'
import { PatentsTab } from './CredentialTabs/PatentsTab'
import { ScrollToTop } from '@/components/ScrollToTop'
import { GraduationCap, BookOpen, FileText, ScrollText, Plus, ArrowUpDown } from 'lucide-react'
import { useUserStore } from '@/stores/userStore'
import { educationsApi, publicationsApi } from '@/api/credentials'
import { SortOption, SORT_OPTIONS } from '@/hooks/useSortableList'

// Academic degree types
const ACADEMIC_DEGREES = ['high_school', 'associate', 'bachelor', 'master', 'doctorate']
// Training types
const TRAINING_TYPES = ['certificate', 'bootcamp', 'course', 'workshop', 'other']

type SubTab = 'academic' | 'trainings' | 'publications' | 'patents'

export default function EducationPublicationsPatentsPage() {
  const { t } = useTranslation()
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('credentials:educationPublicationsPatents.title')}</h1>
          <p className="text-muted-foreground">{t('credentials:educationPublicationsPatents.subtitle')}</p>
        </div>
        <Button onClick={() => setCreateTrigger(c => c + 1)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('common:add')}
        </Button>
      </div>

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

      <ScrollToTop />
    </div>
  )
}
