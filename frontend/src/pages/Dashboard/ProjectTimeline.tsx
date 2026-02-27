import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { FolderKanban } from 'lucide-react'
import type { CompanyGroupedResponse } from '@/api/knowledge'
import { getTimelineRange, dateToPercent, generateYearTicks, formatDate } from './timelineUtils'

interface ProjectTimelineProps {
  data: CompanyGroupedResponse | undefined
  isLoading: boolean
}

export default function ProjectTimeline({ data, isLoading }: ProjectTimelineProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard:projectTimeline.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-[140px] lg:w-[180px] h-4 bg-muted animate-pulse rounded" />
                <div className="flex-1 h-5 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const companies = data?.companies || []
  const allProjects = companies.flatMap((g) =>
    g.projects.map((p) => ({ ...p, companyName: g.company.name }))
  )

  if (allProjects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard:projectTimeline.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FolderKanban className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>{t('dashboard:projectTimeline.empty')}</p>
            <button
              onClick={() => navigate('/knowledge/projects')}
              className="text-primary hover:underline text-sm mt-2"
            >
              {t('dashboard:projectTimeline.addProject')}
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Collect dates for range
  const allDates: (string | null | undefined)[] = []
  allProjects.forEach((p) => { allDates.push(p.start_date, p.end_date) })

  const range = getTimelineRange(allDates)
  const yearTicks = generateYearTicks(range.start, range.end)
  const now = new Date()

  // Group projects by company, preserving company order
  const companyGroups = companies
    .filter((g) => g.projects.length > 0)
    .map((g) => ({
      companyName: g.company.name,
      projects: g.projects,
      companyStart: g.company.start_date ? new Date(g.company.start_date) : range.start,
      companyEnd: g.company.end_date ? new Date(g.company.end_date) : now,
    }))

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>{t('dashboard:projectTimeline.title')}</CardTitle>
          <button
            onClick={() => navigate('/knowledge/projects')}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('dashboard:viewAll')} →
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Year ticks header */}
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
            {companyGroups.map((group, groupIdx) => (
              <div key={group.companyName}>
                {groupIdx > 0 && (
                  <div className="flex items-center my-2">
                    <div className="w-[140px] lg:w-[180px] shrink-0" />
                    <div className="flex-1 border-t border-dashed border-muted-foreground/20" />
                  </div>
                )}
                {group.projects.map((project, idx) => {
                  const pStart = project.start_date ? new Date(project.start_date) : group.companyStart
                  const pEnd = project.end_date ? new Date(project.end_date) : now
                  const pStartPct = dateToPercent(pStart, range.start, range.end)
                  const pEndPct = dateToPercent(pEnd, range.start, range.end)
                  const pWidthPct = Math.max(pEndPct - pStartPct, 1)
                  const isCurrent = !project.end_date

                  return (
                    <div key={project.id} className="flex items-center mb-1.5">
                      <div className="w-[140px] lg:w-[180px] shrink-0 pr-3">
                        {idx === 0 ? (
                          <p className="text-xs text-muted-foreground truncate">{group.companyName}</p>
                        ) : null}
                      </div>
                      <div className="flex-1 relative h-5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className="absolute top-0 h-5 rounded bg-emerald-500/60 dark:bg-emerald-400/50 cursor-pointer hover:bg-emerald-500/80 dark:hover:bg-emerald-400/70 transition-colors flex items-center overflow-hidden"
                              style={{ left: `${pStartPct}%`, width: `${pWidthPct}%`, minWidth: '4px' }}
                              onClick={() => navigate(`/knowledge/projects/${project.id}`)}
                            >
                              {pWidthPct > 8 && (
                                <span className="text-[10px] text-white px-1.5 truncate">
                                  {project.name}
                                </span>
                              )}
                              {isCurrent && (
                                <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/40 animate-pulse rounded-r" />
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="font-medium">{project.name}</p>
                            <p className="text-xs text-muted-foreground">{group.companyName}</p>
                            {project.role && <p className="text-xs">{project.role}</p>}
                            <p className="text-xs text-muted-foreground">
                              {formatDate(project.start_date)} – {isCurrent ? t('dashboard:projectTimeline.present') : formatDate(project.end_date)}
                            </p>
                            {project.technologies.length > 0 && (
                              <p className="text-xs mt-1">
                                {project.technologies.slice(0, 5).join(', ')}
                                {project.technologies.length > 5 && ` +${project.technologies.length - 5}`}
                              </p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  )
}
