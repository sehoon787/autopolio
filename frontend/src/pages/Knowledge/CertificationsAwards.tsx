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
import { CertificationsTab } from './CredentialTabs/CertificationsTab'
import { AwardsTab } from './CredentialTabs/AwardsTab'
import { ScrollToTop } from '@/components/ScrollToTop'
import { Medal, Award, Plus, ArrowUpDown } from 'lucide-react'
import { useUserStore } from '@/stores/userStore'
import { certificationsApi, awardsApi } from '@/api/credentials'
import { SortOption, SORT_OPTIONS } from '@/hooks/useSortableList'

type SubTab = 'certifications' | 'awards'

export default function CertificationsAwardsPage() {
  const { t } = useTranslation()
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('credentials:certificationsAwards.title')}</h1>
          <p className="text-muted-foreground">{t('credentials:certificationsAwards.subtitle')}</p>
        </div>
        <Button onClick={() => setCreateTrigger(c => c + 1)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('common:add')}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SubTab)}>
        <div className="flex items-center justify-between gap-4">
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

        <TabsContent value="certifications" className="mt-4">
          <CertificationsTab createTrigger={createTrigger} sortBy={currentSortBy} />
        </TabsContent>
        <TabsContent value="awards" className="mt-4">
          <AwardsTab createTrigger={createTrigger} sortBy={currentSortBy} />
        </TabsContent>
      </Tabs>

      <ScrollToTop />
    </div>
  )
}
