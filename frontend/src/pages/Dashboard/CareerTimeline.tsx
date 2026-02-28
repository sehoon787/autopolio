import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Building2,
  GraduationCap,
  Code,
  IdCard,
  Trophy,
  FileText,
  ScrollText,
  Heart,
  Users,
} from 'lucide-react'
import type { CompanyGroupedResponse } from '@/api/knowledge'
import type { Education } from '@/api/credentials'
import {
  getTimelineRange, generateYearTicks, parseValidDate, sortByDate,
  LABEL_COL_CLASS, ACADEMIC_DEGREES,
  type CredentialData, type DurationItem, type DurationSubGroup,
  type PointSubGroup, type AccordionGroup, type EmptyHint,
} from './timelineUtils'
import CareerHeatmap from './CareerHeatmap'
import { TimelineDetailTab } from './TimelineDetailTab'
import { TimelineProjectTab } from './TimelineProjectTab'

interface CareerTimelineProps {
  data: CompanyGroupedResponse | undefined
  credentials: CredentialData
  isLoading: boolean
}

export default function CareerTimeline({ data, credentials, isLoading }: CareerTimelineProps) {
  const { t } = useTranslation()
  const [viewMode, setViewMode] = useState<'summary' | 'detail' | 'project'>('summary')

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard:careerTimeline.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className={`${LABEL_COL_CLASS} h-4 bg-muted animate-pulse rounded`} />
                <div className="flex-1 h-6 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const companies = data?.companies || []
  const { certifications, awards, educations, publications, volunteerActivities } = credentials
  const hasCredentials = certifications.length + awards.length + educations.length + publications.length + volunteerActivities.length > 0
  const hasCompanies = companies.length > 0

  const allDates: (string | null | undefined)[] = []
  companies.forEach((c) => {
    allDates.push(c.company.start_date, c.company.end_date)
    c.projects.forEach((p) => { allDates.push(p.start_date, p.end_date) })
  })
  educations.forEach((e) => { allDates.push(e.start_date, e.end_date) })
  certifications.forEach((c) => { allDates.push(c.issue_date) })
  awards.forEach((a) => { allDates.push(a.award_date) })
  publications.forEach((p) => { allDates.push(parseValidDate(p.publication_date)) })
  volunteerActivities.forEach((v) => { allDates.push(v.start_date, v.end_date) })

  const range = getTimelineRange(allDates)
  const yearTicks = generateYearTicks(range.start, range.end)

  const toEduItem = (e: Education): DurationItem => ({
    id: `edu-${e.id}`, label: e.school_name,
    subtitle: [e.major, e.degree].filter(Boolean).join(' / '),
    date: e.start_date, endDate: e.end_date, isCurrent: e.is_current,
  })

  const papers = publications.filter((p) => p.publication_type !== 'patent')
  const patents = publications.filter((p) => p.publication_type === 'patent')
  const volunteers = volunteerActivities.filter((v) => v.activity_type === 'volunteer')
  const externals = volunteerActivities.filter((v) => v.activity_type !== 'volunteer')

  // ── Build accordion groups ──
  const accordionGroups: AccordionGroup[] = []

  // 1. 교육/저술
  {
    const durationSubGroups: DurationSubGroup[] = []
    const pointSubGroups: PointSubGroup[] = []

    const degreeEdu = educations.filter((e) => ACADEMIC_DEGREES.includes(e.degree || ''))
    if (degreeEdu.length > 0) {
      durationSubGroups.push({
        key: 'degree', i18nKey: 'dashboard:careerTimeline.degree', icon: GraduationCap,
        color: 'bg-indigo-500/70', hoverColor: 'hover:bg-indigo-500/90',
        items: degreeEdu.map(toEduItem).sort(sortByDate),
      })
    }
    const trainingEdu = educations.filter((e) => !ACADEMIC_DEGREES.includes(e.degree || ''))
    if (trainingEdu.length > 0) {
      durationSubGroups.push({
        key: 'trainings', i18nKey: 'dashboard:careerTimeline.trainings', icon: Code,
        color: 'bg-cyan-500/70', hoverColor: 'hover:bg-cyan-500/90',
        items: trainingEdu.map(toEduItem).sort(sortByDate),
      })
    }

    if (papers.length > 0) {
      pointSubGroups.push({
        key: 'papers', i18nKey: 'dashboard:careerTimeline.papers', icon: FileText,
        items: papers.map((p) => ({
          id: `pub-${p.id}`, label: p.title, subtitle: p.publisher || p.authors,
          date: parseValidDate(p.publication_date), dotColor: 'bg-emerald-500',
        })).sort(sortByDate),
      })
    }
    if (patents.length > 0) {
      pointSubGroups.push({
        key: 'patents', i18nKey: 'dashboard:careerTimeline.patents', icon: ScrollText,
        items: patents.map((p) => ({
          id: `pat-${p.id}`, label: p.title, subtitle: p.publisher || p.authors,
          date: parseValidDate(p.publication_date), dotColor: 'bg-amber-600',
        })).sort(sortByDate),
      })
    }

    const totalCount = educations.length + papers.length + patents.length
    if (totalCount > 0) {
      accordionGroups.push({
        key: 'educationGroup', i18nKey: 'dashboard:careerTimeline.educationGroup', icon: GraduationCap,
        totalCount, durationSubGroups, pointSubGroups,
      })
    }
  }

  // 2. 자격/수상
  {
    const pointSubGroups: PointSubGroup[] = []
    if (certifications.length > 0) {
      pointSubGroups.push({
        key: 'certifications', i18nKey: 'dashboard:careerTimeline.certifications', icon: IdCard,
        items: certifications.map((c) => ({
          id: `cert-${c.id}`, label: c.name, subtitle: c.issuer, date: c.issue_date, dotColor: 'bg-teal-500',
        })).sort(sortByDate),
      })
    }
    if (awards.length > 0) {
      pointSubGroups.push({
        key: 'awards', i18nKey: 'dashboard:careerTimeline.awards', icon: Trophy,
        items: awards.map((a) => ({
          id: `award-${a.id}`, label: a.name, subtitle: a.issuer, date: a.award_date, dotColor: 'bg-amber-500',
        })).sort(sortByDate),
      })
    }
    const totalCount = certifications.length + awards.length
    if (totalCount > 0) {
      accordionGroups.push({
        key: 'qualificationsGroup', i18nKey: 'dashboard:careerTimeline.qualificationsGroup', icon: IdCard,
        totalCount, durationSubGroups: [], pointSubGroups,
      })
    }
  }

  // 3. 활동
  {
    const durationSubGroups: DurationSubGroup[] = []
    if (volunteers.length > 0) {
      durationSubGroups.push({
        key: 'volunteer', i18nKey: 'dashboard:careerTimeline.volunteer', icon: Heart,
        color: 'bg-pink-500/70', hoverColor: 'hover:bg-pink-500/90',
        items: volunteers.map((v) => ({
          id: `vol-${v.id}`, label: v.name, subtitle: v.organization,
          date: v.start_date, endDate: v.end_date, isCurrent: v.is_current,
        })).sort(sortByDate),
      })
    }
    if (externals.length > 0) {
      durationSubGroups.push({
        key: 'externalActivities', i18nKey: 'dashboard:careerTimeline.externalActivities', icon: Users,
        color: 'bg-purple-500/70', hoverColor: 'hover:bg-purple-500/90',
        items: externals.map((v) => ({
          id: `ext-${v.id}`, label: v.name, subtitle: v.organization,
          date: v.start_date, endDate: v.end_date, isCurrent: v.is_current,
        })).sort(sortByDate),
      })
    }
    const totalCount = volunteers.length + externals.length
    if (totalCount > 0) {
      accordionGroups.push({
        key: 'activitiesGroup', i18nKey: 'dashboard:careerTimeline.activitiesGroup', icon: Users,
        totalCount, durationSubGroups, pointSubGroups: [],
      })
    }
  }

  const hasAccordionGroups = accordionGroups.length > 0

  const emptyHints = [
    !hasCompanies && { icon: Building2, label: t('dashboard:careerTimeline.emptyCompanies'), addLabel: t('dashboard:careerTimeline.goAddCompany'), path: '/knowledge/companies' },
    educations.length + papers.length + patents.length === 0 && { icon: GraduationCap, label: t('dashboard:careerTimeline.emptyEducation'), addLabel: t('dashboard:careerTimeline.goAddEducation'), path: '/knowledge/education-publications-patents' },
    certifications.length + awards.length === 0 && { icon: IdCard, label: t('dashboard:careerTimeline.emptyCertifications'), addLabel: t('dashboard:careerTimeline.goAddCertification'), path: '/knowledge/certifications-awards' },
    volunteerActivities.length === 0 && { icon: Heart, label: t('dashboard:careerTimeline.emptyActivities'), addLabel: t('dashboard:careerTimeline.goAddActivity'), path: '/knowledge/activities' },
  ].filter(Boolean) as EmptyHint[]

  return (
    <Card>
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'summary' | 'detail' | 'project')}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>{t('dashboard:careerTimeline.title')}</CardTitle>
            <TabsList className="h-7">
              <TabsTrigger value="summary" className="text-xs px-2 py-1 h-5">
                {t('dashboard:careerTimeline.viewSummary')}
              </TabsTrigger>
              <TabsTrigger value="detail" className="text-xs px-2 py-1 h-5">
                {t('dashboard:careerTimeline.viewDetail')}
              </TabsTrigger>
              <TabsTrigger value="project" className="text-xs px-2 py-1 h-5">
                {t('dashboard:careerTimeline.viewProject')}
              </TabsTrigger>
            </TabsList>
          </div>
        </CardHeader>
        <CardContent>
          <TabsContent value="summary" className="mt-0">
            <CareerHeatmap data={data} credentials={credentials} />
          </TabsContent>
          <TabsContent value="detail" className="mt-0">
            <TimelineDetailTab
              companies={companies}
              accordionGroups={accordionGroups}
              hasCompanies={hasCompanies}
              hasCredentials={hasCredentials}
              hasAccordionGroups={hasAccordionGroups}
              range={range}
              yearTicks={yearTicks}
              emptyHints={emptyHints}
            />
          </TabsContent>
          <TabsContent value="project" className="mt-0">
            <TimelineProjectTab
              companies={companies}
              range={range}
              yearTicks={yearTicks}
            />
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  )
}
