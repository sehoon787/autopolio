import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import type { CompanyGroupedResponse } from '@/api/knowledge'
import type { Certification, Award, Education, Publication, VolunteerActivity } from '@/api/credentials'
import { getTimelineRange, dateToPercent, generateYearTicks, formatDate } from './timelineUtils'

function parseValidDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const segment = raw.split('|')[0].trim()
  if (!segment) return null
  const d = new Date(segment)
  if (isNaN(d.getTime())) return null
  return segment
}

type DurationItem = {
  id: string; label: string; subtitle: string | null
  date: string | null; endDate?: string | null; isCurrent?: boolean
}
type DurationSubGroup = {
  key: string; i18nKey: string; icon: typeof GraduationCap
  color: string; hoverColor: string; items: DurationItem[]
}
type PointItem = {
  id: string; label: string; subtitle: string | null
  date: string | null; dotColor: string
}
type PointSubGroup = {
  key: string; i18nKey: string; icon: typeof GraduationCap
  items: PointItem[]
}
type AccordionGroup = {
  key: string; i18nKey: string; icon: typeof GraduationCap
  totalCount: number
  durationSubGroups: DurationSubGroup[]
  pointSubGroups: PointSubGroup[]
}

interface CredentialData {
  certifications: Certification[]
  awards: Award[]
  educations: Education[]
  publications: Publication[]
  volunteerActivities: VolunteerActivity[]
}

interface CareerTimelineProps {
  data: CompanyGroupedResponse | undefined
  credentials: CredentialData
  isLoading: boolean
}

const sortByDate = (a: { date: string | null }, b: { date: string | null }) => {
  if (a.date && b.date) return new Date(a.date).getTime() - new Date(b.date).getTime()
  if (a.date) return -1
  if (b.date) return 1
  return 0
}

const ACADEMIC_DEGREES = ['high_school', 'associate', 'bachelor', 'master', 'doctorate']
const MIN_BAR_PCT_FOR_LABEL = 4

export default function CareerTimeline({ data, credentials, isLoading }: CareerTimelineProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

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
                <div className="w-[140px] lg:w-[180px] h-4 bg-muted animate-pulse rounded" />
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

  if (!hasCompanies && !hasCredentials) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard:careerTimeline.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>{t('dashboard:careerTimeline.empty')}</p>
            <button
              onClick={() => navigate('/knowledge/companies')}
              className="text-primary hover:underline text-sm mt-2"
            >
              {t('dashboard:careerTimeline.addCompany')}
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const allDates: (string | null | undefined)[] = []
  companies.forEach((c) => { allDates.push(c.company.start_date, c.company.end_date) })
  educations.forEach((e) => { allDates.push(e.start_date, e.end_date) })
  certifications.forEach((c) => { allDates.push(c.issue_date) })
  awards.forEach((a) => { allDates.push(a.award_date) })
  publications.forEach((p) => { allDates.push(parseValidDate(p.publication_date)) })
  volunteerActivities.forEach((v) => { allDates.push(v.start_date, v.end_date) })

  const range = getTimelineRange(allDates)
  const yearTicks = generateYearTicks(range.start, range.end)
  const now = new Date()

  const toEduItem = (e: Education): DurationItem => ({
    id: `edu-${e.id}`, label: e.school_name,
    subtitle: [e.major, e.degree].filter(Boolean).join(' / '),
    date: e.start_date, endDate: e.end_date, isCurrent: e.is_current,
  })

  const papers = publications.filter((p) => p.publication_type !== 'patent')
  const patents = publications.filter((p) => p.publication_type === 'patent')
  const volunteers = volunteerActivities.filter((v) => v.activity_type === 'volunteer')
  const externals = volunteerActivities.filter((v) => v.activity_type !== 'volunteer')

  // ── Build 3 accordion groups ──
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

  // ── Render: sub-type row (shown when expanded) ──
  const renderCompactDuration = (sub: DurationSubGroup) => {
    const SubIcon = sub.icon
    const datedItems = sub.items.filter((item) => item.date)
    if (datedItems.length === 0 && sub.items.length === 0) return null

    return (
      <div key={sub.key} className="flex items-center mb-0.5">
        <div className="w-[140px] lg:w-[180px] shrink-0 pr-3 pl-6">
          <div className="flex items-center gap-1.5 min-w-0">
            <SubIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground truncate">
              {t(sub.i18nKey)} ({sub.items.length})
            </span>
          </div>
        </div>
        <div className="flex-1 relative h-6">
          {datedItems.map((item) => {
            const sDate = new Date(item.date!)
            const eDate = item.endDate ? new Date(item.endDate) : (item.isCurrent ? now : sDate)
            const sPct = dateToPercent(sDate, range.start, range.end)
            const ePct = dateToPercent(eDate, range.start, range.end)
            const wPct = Math.max(ePct - sPct, 0.5)
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <div
                    className={`absolute h-5 rounded ${sub.color} ${sub.hoverColor} cursor-pointer transition-colors flex items-center overflow-hidden`}
                    style={{ left: `${sPct}%`, width: `${wPct}%`, minWidth: '4px', top: '50%', transform: 'translateY(-50%)' }}
                    onClick={() => navigate('/knowledge/credentials')}
                  >
                    {wPct > MIN_BAR_PCT_FOR_LABEL && (
                      <span className="text-[10px] text-white px-1 truncate">{item.label}</span>
                    )}
                    {item.isCurrent && (
                      <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/40 animate-pulse rounded-r" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="font-medium">{item.label}</p>
                  {item.subtitle && <p className="text-xs text-muted-foreground">{item.subtitle}</p>}
                  <p className="text-xs text-muted-foreground">
                    {formatDate(item.date)} – {item.isCurrent ? t('dashboard:careerTimeline.present') : (formatDate(item.endDate) || '')}
                  </p>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </div>
    )
  }

  const renderCompactPoint = (sub: PointSubGroup) => {
    const SubIcon = sub.icon
    const datedItems = sub.items.filter((item) => item.date)
    if (datedItems.length === 0 && sub.items.length === 0) return null

    return (
      <div key={sub.key} className="flex items-center mb-0.5">
        <div className="w-[140px] lg:w-[180px] shrink-0 pr-3 pl-6">
          <div className="flex items-center gap-1.5 min-w-0">
            <SubIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground truncate">
              {t(sub.i18nKey)} ({sub.items.length})
            </span>
          </div>
        </div>
        <div className="flex-1 relative h-4 flex items-center">
          {datedItems.length === 0 && sub.items.length > 0 && (
            <span className="text-[10px] text-muted-foreground/60 italic pl-1">
              ({sub.items.length}건 — {t('dashboard:careerTimeline.noDate')})
            </span>
          )}
          {datedItems.map((item) => {
            const pct = dateToPercent(new Date(item.date!), range.start, range.end)
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <div
                    className={`absolute w-2.5 h-2.5 rounded-full ${item.dotColor} cursor-pointer hover:scale-125 transition-transform ring-2 ring-background`}
                    style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
                    onClick={() => navigate('/knowledge/credentials')}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="font-medium">{item.label}</p>
                  {item.subtitle && <p className="text-xs text-muted-foreground">{item.subtitle}</p>}
                  <p className="text-xs text-muted-foreground">{formatDate(item.date)}</p>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Main render ──
  const renderAccordionGroup = (group: AccordionGroup, index: number) => {
    const isExpanded = expandedGroups.has(group.key)
    const Icon = group.icon

    return (
      <div key={group.key}>
        {/* Separator between groups */}
        {index > 0 && (
          <div className="flex items-center my-2">
            <div className="w-[140px] lg:w-[180px] shrink-0" />
            <div className="flex-1 border-t border-dashed border-muted-foreground/20" />
          </div>
        )}

        {/* Group header */}
        <div
          className="flex items-center mb-1 cursor-pointer select-none"
          onClick={() => toggleGroup(group.key)}
        >
          <div className="w-[140px] lg:w-[180px] shrink-0 pr-3">
            <div className="flex items-center gap-1 min-w-0">
              {isExpanded
                ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              }
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium truncate">
                {t(group.i18nKey)} ({group.totalCount})
              </span>
            </div>
          </div>
          <div className="flex-1" />
        </div>

        {/* Sub-type rows: hidden when collapsed, shown when expanded */}
        {isExpanded && (
          <>
            {group.durationSubGroups.map((sub) => renderCompactDuration(sub))}
            {group.pointSubGroups.map((sub) => renderCompactPoint(sub))}
          </>
        )}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>{t('dashboard:careerTimeline.title')}</CardTitle>
          <button
            onClick={() => navigate('/knowledge/companies/timeline')}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('dashboard:viewAll')} →
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Year ticks */}
          <div className="flex items-center mb-3">
            <div className="w-[140px] lg:w-[180px] shrink-0" />
            <div className="flex-1 relative h-5">
              {yearTicks.map((year) => {
                const pct = dateToPercent(new Date(year, 0, 1), range.start, range.end)
                return (
                  <span
                    key={year}
                    className="absolute text-xs text-muted-foreground -translate-x-1/2"
                    style={{ left: `${pct}%` }}
                  >
                    {year}
                  </span>
                )
              })}
            </div>
          </div>

          <TooltipProvider delayDuration={200}>
            {/* Company rows */}
            {companies.map((group) => {
              const company = group.company
              const startDate = company.start_date ? new Date(company.start_date) : range.start
              const endDate = company.end_date ? new Date(company.end_date) : now
              const startPct = dateToPercent(startDate, range.start, range.end)
              const endPct = dateToPercent(endDate, range.start, range.end)
              const widthPct = Math.max(endPct - startPct, 1)
              const isCurrent = !company.end_date || company.is_current

              return (
                <div key={company.id} className="mb-3">
                  <div className="flex items-center">
                    <div className="w-[140px] lg:w-[180px] shrink-0 pr-3">
                      <p className="text-sm font-medium truncate">{company.name}</p>
                      {company.position && (
                        <p className="text-xs text-muted-foreground truncate">{company.position}</p>
                      )}
                    </div>
                    <div className="flex-1 relative h-7">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute top-0 h-7 rounded bg-blue-500/70 dark:bg-blue-400/60 cursor-pointer hover:bg-blue-500/90 dark:hover:bg-blue-400/80 transition-colors flex items-center overflow-hidden"
                            style={{ left: `${startPct}%`, width: `${widthPct}%`, minWidth: '4px' }}
                            onClick={() => navigate('/knowledge/companies/timeline')}
                          >
                            {widthPct > 8 && (
                              <span className="text-[10px] text-white px-1.5 truncate">
                                {formatDate(company.start_date)} – {isCurrent ? t('dashboard:careerTimeline.present') : formatDate(company.end_date)}
                              </span>
                            )}
                            {isCurrent && (
                              <div className="absolute right-0 top-0 bottom-0 w-1 bg-blue-300 animate-pulse rounded-r" />
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-medium">{company.name}</p>
                          {company.position && <p className="text-xs">{company.position}</p>}
                          <p className="text-xs text-muted-foreground">
                            {formatDate(company.start_date)} – {isCurrent ? t('dashboard:careerTimeline.present') : formatDate(company.end_date)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t('dashboard:careerTimeline.projects', { count: group.project_count })}
                          </p>
                          {group.aggregated_tech_stack.length > 0 && (
                            <p className="text-xs mt-1">
                              <span className="text-muted-foreground">{t('dashboard:careerTimeline.techStack')}: </span>
                              {group.aggregated_tech_stack.slice(0, 5).join(', ')}
                              {group.aggregated_tech_stack.length > 5 && ` +${group.aggregated_tech_stack.length - 5}`}
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Separator: companies → accordion groups */}
            {hasAccordionGroups && hasCompanies && (
              <div className="flex items-center my-3">
                <div className="w-[140px] lg:w-[180px] shrink-0" />
                <div className="flex-1 border-t border-dashed" />
              </div>
            )}

            {/* Accordion groups */}
            {accordionGroups.map((group, index) => renderAccordionGroup(group, index))}
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  )
}
