import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { CompanySummaryResponse } from '@/api/knowledge'
import {
  dateToPercent, formatDate, LABEL_COL_CLASS, MIN_BAR_WIDTH_PCT,
  BAR_LABEL_THRESHOLD_PCT, MAX_TOOLTIP_ITEMS,
  type AccordionGroup, type EmptyHint,
} from './timelineUtils'
import { YearTicksRow, AccordionGroupRow, EmptyHintRows } from './TimelineRows'

interface TimelineRange { start: Date; end: Date }

interface TimelineDetailTabProps {
  companies: CompanySummaryResponse[]
  accordionGroups: AccordionGroup[]
  hasCompanies: boolean
  hasCredentials: boolean
  hasAccordionGroups: boolean
  range: TimelineRange
  yearTicks: number[]
  emptyHints: EmptyHint[]
}

export function TimelineDetailTab({
  companies, accordionGroups, hasCompanies, hasCredentials,
  hasAccordionGroups, range, yearTicks, emptyHints,
}: TimelineDetailTabProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const now = new Date()

  if (!hasCompanies && !hasCredentials) {
    return (
      <div className="py-4">
        <EmptyHintRows hints={emptyHints} showSeparatorBefore={false} />
      </div>
    )
  }

  return (
    <div className="relative">
      <YearTicksRow yearTicks={yearTicks} range={range} />

      <TooltipProvider delayDuration={200}>
        {companies.map((group) => {
          const company = group.company
          const startDate = company.start_date ? new Date(company.start_date) : range.start
          const endDate = company.end_date ? new Date(company.end_date) : now
          const startPct = dateToPercent(startDate, range.start, range.end)
          const endPct = dateToPercent(endDate, range.start, range.end)
          const widthPct = Math.max(endPct - startPct, MIN_BAR_WIDTH_PCT)
          const isCurrent = !company.end_date || company.is_current

          return (
            <div key={company.id} className="flex items-center py-1.5">
              <div className={`${LABEL_COL_CLASS} shrink-0 pr-3`}>
                <p className="text-sm font-medium truncate">{company.name}</p>
                {company.position && (
                  <p className="text-xs text-muted-foreground truncate">{company.position}</p>
                )}
              </div>
              <div className="flex-1 relative h-6">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="absolute top-0 h-6 rounded bg-blue-500/70 dark:bg-blue-400/60 cursor-pointer hover:bg-blue-500/90 dark:hover:bg-blue-400/80 transition-colors flex items-center overflow-hidden"
                      style={{ left: `${startPct}%`, width: `${widthPct}%`, minWidth: '4px' }}
                      onClick={() => navigate('/knowledge/companies/timeline')}
                    >
                      {widthPct > BAR_LABEL_THRESHOLD_PCT && (
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
                        {group.aggregated_tech_stack.slice(0, MAX_TOOLTIP_ITEMS).join(', ')}
                        {group.aggregated_tech_stack.length > MAX_TOOLTIP_ITEMS && ` +${group.aggregated_tech_stack.length - MAX_TOOLTIP_ITEMS}`}
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )
        })}

        {hasAccordionGroups && hasCompanies && (
          <div className="flex items-center my-3">
            <div className={`${LABEL_COL_CLASS} shrink-0`} />
            <div className="flex-1 border-t border-dashed" />
          </div>
        )}

        {accordionGroups.map((group, index) => (
          <AccordionGroupRow key={group.key} group={group} index={index} range={range} />
        ))}
      </TooltipProvider>

      <EmptyHintRows hints={emptyHints} showSeparatorBefore={hasCompanies || hasAccordionGroups} />
    </div>
  )
}
