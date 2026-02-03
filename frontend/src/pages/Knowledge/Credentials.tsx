import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CertificationsTab } from './CredentialTabs/CertificationsTab'
import { AwardsTab } from './CredentialTabs/AwardsTab'
import { AcademicEducationTab } from './CredentialTabs/AcademicEducationTab'
import { TrainingsTab } from './CredentialTabs/TrainingsTab'
import { PublicationsTab } from './CredentialTabs/PublicationsTab'
import { VolunteerActivitiesTab } from './CredentialTabs/VolunteerActivitiesTab'
import { ScrollToTop } from '@/components/ScrollToTop'
import { Award, GraduationCap, FileText, Medal, Heart, BookOpen } from 'lucide-react'
import { useUserStore } from '@/stores/userStore'
import {
  certificationsApi,
  awardsApi,
  educationsApi,
  publicationsApi,
  volunteerActivitiesApi,
} from '@/api/credentials'

type MainTab = 'education_publications' | 'certifications_awards' | 'activities'
type EducationSubTab = 'academic' | 'trainings' | 'publications'
type CertificationSubTab = 'certifications' | 'awards'
type ActivitySubTab = 'volunteer' | 'external'

// Academic degree types
const ACADEMIC_DEGREES = ['high_school', 'associate', 'bachelor', 'master', 'doctorate']
// Training types
const TRAINING_TYPES = ['certificate', 'bootcamp', 'course', 'workshop', 'other']

export default function CredentialsPage() {
  const { t } = useTranslation()
  const [mainTab, setMainTab] = useState<MainTab>('education_publications')
  const [educationSubTab, setEducationSubTab] = useState<EducationSubTab>('academic')
  const [certificationSubTab, setCertificationSubTab] = useState<CertificationSubTab>('certifications')
  const [activitySubTab, setActivitySubTab] = useState<ActivitySubTab>('volunteer')
  const { user } = useUserStore()

  // Fetch counts for each credential type
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

  const { data: activitiesData } = useQuery({
    queryKey: ['volunteer_activities', user?.id],
    queryFn: () => volunteerActivitiesApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  // Split education counts
  const allEducations = educationsData?.data || []
  const academicCount = allEducations.filter(
    (e) => ACADEMIC_DEGREES.includes(e.degree || '') || !e.degree
  ).length
  const trainingsCount = allEducations.filter((e) =>
    TRAINING_TYPES.includes(e.degree || '')
  ).length

  // Split activities counts
  const allActivities = activitiesData?.data || []
  const volunteerCount = allActivities.filter((a) => a.activity_type === 'volunteer').length
  const externalCount = allActivities.filter((a) => a.activity_type === 'external').length

  const counts = {
    certifications: certificationsData?.data?.length ?? 0,
    awards: awardsData?.data?.length ?? 0,
    academic: academicCount,
    trainings: trainingsCount,
    publications: publicationsData?.data?.length ?? 0,
    volunteer: volunteerCount,
    external: externalCount,
  }

  // Group totals
  const educationPublicationsTotal = counts.academic + counts.trainings + counts.publications
  const certificationsAwardsTotal = counts.certifications + counts.awards
  const activitiesTotal = counts.volunteer + counts.external

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('credentials:title')}</h1>
        <p className="text-muted-foreground">{t('credentials:subtitle')}</p>
      </div>

      {/* Main Category Tabs */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="education_publications" className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            <span className="hidden sm:inline">
              {t('credentials:groups.educationPublications')}
              {educationPublicationsTotal > 0 && ` (${educationPublicationsTotal})`}
            </span>
          </TabsTrigger>
          <TabsTrigger value="certifications_awards" className="flex items-center gap-2">
            <Medal className="h-4 w-4" />
            <span className="hidden sm:inline">
              {t('credentials:groups.certificationsAwards')}
              {certificationsAwardsTotal > 0 && ` (${certificationsAwardsTotal})`}
            </span>
          </TabsTrigger>
          <TabsTrigger value="activities" className="flex items-center gap-2">
            <Heart className="h-4 w-4" />
            <span className="hidden sm:inline">
              {t('credentials:groups.activities')}
              {activitiesTotal > 0 && ` (${activitiesTotal})`}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Education & Publications Group */}
        <TabsContent value="education_publications" className="mt-6">
          <Tabs value={educationSubTab} onValueChange={(v) => setEducationSubTab(v as EducationSubTab)}>
            <TabsList>
              <TabsTrigger value="academic" className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                {t('credentials:tabs.academicEducation')}
                {counts.academic > 0 && ` (${counts.academic})`}
              </TabsTrigger>
              <TabsTrigger value="trainings" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                {t('credentials:tabs.trainings')}
                {counts.trainings > 0 && ` (${counts.trainings})`}
              </TabsTrigger>
              <TabsTrigger value="publications" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {t('credentials:tabs.publications')}
                {counts.publications > 0 && ` (${counts.publications})`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="academic" className="mt-4">
              <AcademicEducationTab />
            </TabsContent>
            <TabsContent value="trainings" className="mt-4">
              <TrainingsTab />
            </TabsContent>
            <TabsContent value="publications" className="mt-4">
              <PublicationsTab />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Certifications & Awards Group */}
        <TabsContent value="certifications_awards" className="mt-6">
          <Tabs value={certificationSubTab} onValueChange={(v) => setCertificationSubTab(v as CertificationSubTab)}>
            <TabsList>
              <TabsTrigger value="certifications" className="flex items-center gap-2">
                <Medal className="h-4 w-4" />
                {t('credentials:tabs.certifications')}
                {counts.certifications > 0 && ` (${counts.certifications})`}
              </TabsTrigger>
              <TabsTrigger value="awards" className="flex items-center gap-2">
                <Award className="h-4 w-4" />
                {t('credentials:tabs.awards')}
                {counts.awards > 0 && ` (${counts.awards})`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="certifications" className="mt-4">
              <CertificationsTab />
            </TabsContent>
            <TabsContent value="awards" className="mt-4">
              <AwardsTab />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Activities Group */}
        <TabsContent value="activities" className="mt-6">
          <Tabs value={activitySubTab} onValueChange={(v) => setActivitySubTab(v as ActivitySubTab)}>
            <TabsList>
              <TabsTrigger value="volunteer" className="flex items-center gap-2">
                <Heart className="h-4 w-4" />
                {t('credentials:tabs.volunteerActivities')}
                {counts.volunteer > 0 && ` (${counts.volunteer})`}
              </TabsTrigger>
              <TabsTrigger value="external" className="flex items-center gap-2">
                <Award className="h-4 w-4" />
                {t('credentials:tabs.externalActivities')}
                {counts.external > 0 && ` (${counts.external})`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="volunteer" className="mt-4">
              <VolunteerActivitiesTab activityType="volunteer" />
            </TabsContent>
            <TabsContent value="external" className="mt-4">
              <VolunteerActivitiesTab activityType="external" />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      <ScrollToTop />
    </div>
  )
}
