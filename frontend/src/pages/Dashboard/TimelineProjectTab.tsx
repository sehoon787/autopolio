import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { FolderKanban } from 'lucide-react'
import type { CompanySummaryResponse } from '@/api/knowledge'
import {
  dateToPercent, formatDate, LABEL_COL_CLASS, MIN_BAR_WIDTH_PCT,
  BAR_LABEL_THRESHOLD_PCT, MAX_TOOLTIP_ITEMS,
} from './timelineUtils'
import { YearTicksRow } from './TimelineRows'

interface TimelineRange { start: Date; end: Date }

interface TimelineProjectTabProps {
  companies: CompanySummaryResponse[]
  range: TimelineRange
  yearTicks: number[]
}

export function TimelineProjectTab({ companies, range, yearTicks }: TimelineProjectTabProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const now = new Date()

  if (!companies.some((g) => g.projects.length > 0)) {
    return (
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
    )
  }

  return (
    <div className="relative">
      <YearTicksRow yearTicks={yearTicks} range={range} />

      <TooltipProvider delayDuration={200}>
        {companies.map((group) => {
          if (group.projects.length === 0) return null
          const company = group.company
          const startDate = company.start_date ? new Date(company.start_date) : range.start

          return (
            <div key={company.id}>
              <div className="flex items-center py-1.5">
                <div className={`${LABEL_COL_CLASS} shrink-0 pr-3`}>
                  <p className="text-xs font-medium text-muted-foreground truncate">{company.name}</p>
                </div>
                <div className="flex-1" />
              </div>

              {group.projects.map((project) => {
                const pStart = project.start_date ? new Date(project.start_date) : startDate
                const pEnd = project.end_date ? new Date(project.end_date) : now
                const pStartPct = dateToPercent(pStart, range.start, range.end)
                const pEndPct = dateToPercent(pEnd, range.start, range.end)
                const pWidthPct = Math.max(pEndPct - pStartPct, MIN_BAR_WIDTH_PCT)
                const pIsCurrent = !project.end_date

                return (
                  <div key={project.id} className="flex items-center py-1.5">
                    <div className={`${LABEL_COL_CLASS} shrink-0 pr-3 pl-4`}>
                      <p className="text-xs truncate">{project.name}</p>
                    </div>
                    <div className="flex-1 relative h-5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute top-0 h-5 rounded bg-emerald-500/60 dark:bg-emerald-400/50 cursor-pointer hover:bg-emerald-500/80 dark:hover:bg-emerald-400/70 transition-colors flex items-center overflow-hidden"
                            style={{ left: `${pStartPct}%`, width: `${pWidthPct}%`, minWidth: '4px' }}
                            onClick={() => navigate(`/knowledge/projects/${project.id}`)}
                          >
                            {pWidthPct > BAR_LABEL_THRESHOLD_PCT && (
                              <span className="text-[10px] text-white px-1.5 truncate">{project.name}</span>
                            )}
                            {pIsCurrent && (
                              <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/40 animate-pulse rounded-r" />
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-medium">{project.name}</p>
                          <p className="text-xs text-muted-foreground">{company.name}</p>
                          {project.role && <p className="text-xs">{project.role}</p>}
                          <p className="text-xs text-muted-foreground">
                            {formatDate(project.start_date)} – {pIsCurrent ? t('dashboard:careerTimeline.present') : formatDate(project.end_date)}
                          </p>
                          {project.technologies.length > 0 && (
                            <p className="text-xs mt-1">
                              {project.technologies.slice(0, MAX_TOOLTIP_ITEMS).join(', ')}
                              {project.technologies.length > MAX_TOOLTIP_ITEMS && ` +${project.technologies.length - MAX_TOOLTIP_ITEMS}`}
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </TooltipProvider>
    </div>
  )
}
