import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ArrowRight } from 'lucide-react'
import {
  dateToPercent, formatDate, LABEL_COL_CLASS, BAR_LABEL_THRESHOLD_PCT,
  type DurationSubGroup, type PointSubGroup, type AccordionGroup, type EmptyHint,
} from './timelineUtils'

interface TimelineRange { start: Date; end: Date }

export function YearTicksRow({ yearTicks, range }: { yearTicks: number[]; range: TimelineRange }) {
  return (
    <div className="flex items-center mb-3">
      <div className={`${LABEL_COL_CLASS} shrink-0`} />
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
  )
}

export function DurationSubRow({ sub, range }: { sub: DurationSubGroup; range: TimelineRange }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const now = new Date()
  const SubIcon = sub.icon
  const datedItems = sub.items.filter((item) => item.date)
  if (datedItems.length === 0 && sub.items.length === 0) return null

  return (
    <div className="flex items-center py-1.5">
      <div className={`${LABEL_COL_CLASS} shrink-0 pr-3 pl-6`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <SubIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="text-xs text-muted-foreground truncate">
            {t(sub.i18nKey)} ({sub.items.length})
          </span>
        </div>
      </div>
      <div className="flex-1 relative h-5">
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
                  {wPct > BAR_LABEL_THRESHOLD_PCT && (
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

export function PointSubRow({ sub, range }: { sub: PointSubGroup; range: TimelineRange }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const SubIcon = sub.icon
  const datedItems = sub.items.filter((item) => item.date)
  if (datedItems.length === 0 && sub.items.length === 0) return null

  return (
    <div className="flex items-center py-1.5">
      <div className={`${LABEL_COL_CLASS} shrink-0 pr-3 pl-6`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <SubIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="text-xs text-muted-foreground truncate">
            {t(sub.i18nKey)} ({sub.items.length})
          </span>
        </div>
      </div>
      <div className="flex-1 relative h-5 flex items-center">
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

export function AccordionGroupRow({ group, index, range }: { group: AccordionGroup; index: number; range: TimelineRange }) {
  const { t } = useTranslation()
  const Icon = group.icon

  return (
    <div>
      {index > 0 && (
        <div className="flex items-center my-2">
          <div className={`${LABEL_COL_CLASS} shrink-0`} />
          <div className="flex-1 border-t border-dashed border-muted-foreground/20" />
        </div>
      )}
      <div className="flex items-center py-1.5">
        <div className={`${LABEL_COL_CLASS} shrink-0 pr-3`}>
          <div className="flex items-center gap-1 min-w-0">
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium truncate">
              {t(group.i18nKey)} ({group.totalCount})
            </span>
          </div>
        </div>
        <div className="flex-1" />
      </div>
      {group.durationSubGroups.map((sub) => (
        <DurationSubRow key={sub.key} sub={sub} range={range} />
      ))}
      {group.pointSubGroups.map((sub) => (
        <PointSubRow key={sub.key} sub={sub} range={range} />
      ))}
    </div>
  )
}

export function EmptyHintRows({ hints, showSeparatorBefore }: { hints: EmptyHint[]; showSeparatorBefore: boolean }) {
  const navigate = useNavigate()
  if (hints.length === 0) return null

  return (
    <>
      {hints.map((g, i) => {
        const Icon = g.icon
        return (
          <div key={`${g.path}-${i}`}>
            {(i > 0 || showSeparatorBefore) && (
              <div className="flex items-center my-2">
                <div className={`${LABEL_COL_CLASS} shrink-0`} />
                <div className="flex-1 border-t border-dashed border-muted-foreground/20" />
              </div>
            )}
            <div className="flex items-center py-1.5">
              <div className={`${LABEL_COL_CLASS} shrink-0 pr-3`}>
                <div className="flex items-center gap-1 min-w-0">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium truncate text-muted-foreground">
                    {g.label}
                  </span>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center h-7">
                <button
                  onClick={() => navigate(g.path)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-dashed border-muted-foreground/30 text-xs text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                >
                  {g.addLabel}
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}
