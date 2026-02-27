import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { CompanyGroupedResponse } from '@/api/knowledge'
import type { Certification, Award, Education, Publication, VolunteerActivity } from '@/api/credentials'
import { parseValidDate } from './timelineUtils'

interface CredentialData {
  certifications: Certification[]
  awards: Award[]
  educations: Education[]
  publications: Publication[]
  volunteerActivities: VolunteerActivity[]
}

interface CareerHeatmapProps {
  data: CompanyGroupedResponse | undefined
  credentials: CredentialData
}

interface HeatmapItem {
  label: string
  category: string
}

interface DayCell {
  date: Date
  count: number
  items: HeatmapItem[]
  inYear: boolean
}

interface CareerSpan {
  start: Date
  end: Date
  item: HeatmapItem
}

const LEVEL_CLASSES: Record<number, string> = {
  0: 'bg-muted',
  1: 'bg-emerald-200 dark:bg-emerald-900',
  2: 'bg-emerald-400 dark:bg-emerald-700',
  3: 'bg-emerald-500 dark:bg-emerald-500',
  4: 'bg-emerald-700 dark:bg-emerald-400',
}

const GAP = 3

function getLevel(count: number, maxCount: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0
  if (maxCount <= 4) return Math.min(count, 4) as 0 | 1 | 2 | 3 | 4
  const ratio = count / maxCount
  if (ratio <= 0.25) return 1
  if (ratio <= 0.50) return 2
  if (ratio <= 0.75) return 3
  return 4
}

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDayDate(d: Date): string {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function CareerHeatmap({ data, credentials }: CareerHeatmapProps) {
  const { t } = useTranslation()
  const monthNames = t('dashboard:careerTimeline.heatmapMonths').split(',')

  // Collect career spans and available years
  const { spans, availableYears } = useMemo(() => {
    const spans: CareerSpan[] = []
    const yearSet = new Set<number>()
    const companies = data?.companies || []
    const { certifications, awards, educations, publications, volunteerActivities } = credentials

    const addSpan = (
      startStr: string | null | undefined,
      endStr: string | null | undefined,
      isCurrent: boolean | undefined,
      label: string,
      category: string,
    ) => {
      if (!startStr) return
      const start = new Date(startStr)
      if (isNaN(start.getTime())) return
      let end: Date
      if (endStr) {
        end = new Date(endStr)
        if (isNaN(end.getTime())) end = new Date()
      } else if (isCurrent) {
        end = new Date()
      } else {
        end = start
      }
      spans.push({ start, end, item: { label, category } })
      for (let y = start.getFullYear(); y <= end.getFullYear(); y++) yearSet.add(y)
    }

    companies.forEach((g) => {
      addSpan(g.company.start_date, g.company.end_date, g.company.is_current,
        g.company.name, t('dashboard:careerTimeline.title'))
      g.projects.forEach((p) =>
        addSpan(p.start_date, p.end_date, false, p.name, t('dashboard:projectTimeline.title')))
    })
    educations.forEach((e) =>
      addSpan(e.start_date, e.end_date, e.is_current, e.school_name, t('dashboard:careerTimeline.degree')))
    volunteerActivities.forEach((v) =>
      addSpan(v.start_date, v.end_date, v.is_current, v.name, t('dashboard:careerTimeline.activitiesGroup')))
    certifications.forEach((c) =>
      addSpan(c.issue_date, null, false, c.name, t('dashboard:careerTimeline.certifications')))
    awards.forEach((a) =>
      addSpan(a.award_date, null, false, a.name, t('dashboard:careerTimeline.awards')))
    publications.forEach((p) =>
      addSpan(parseValidDate(p.publication_date), null, false, p.title, t('dashboard:careerTimeline.publications')))

    const years = Array.from(yearSet).sort((a, b) => a - b)
    if (years.length === 0) years.push(new Date().getFullYear())
    return { spans, availableYears: years }
  }, [data, credentials, t])

  const [selectedYear, setSelectedYear] = useState(() => {
    const cy = new Date().getFullYear()
    return availableYears.includes(cy) ? cy : availableYears[availableYears.length - 1]
  })

  // Build weekly grid for selected year
  const { weeks, monthLabelMap, maxCount } = useMemo(() => {
    const jan1 = new Date(selectedYear, 0, 1)
    const dec31 = new Date(selectedYear, 11, 31)
    const gridStart = new Date(jan1)
    gridStart.setDate(gridStart.getDate() - gridStart.getDay())
    const gridEnd = new Date(dec31)
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()))

    const dayMap = new Map<string, { count: number; items: HeatmapItem[] }>()
    spans.forEach((sp) => {
      const s = sp.start < gridStart ? gridStart : sp.start
      const e = sp.end > gridEnd ? gridEnd : sp.end
      if (s > gridEnd || e < gridStart) return
      const cursor = new Date(s.getFullYear(), s.getMonth(), s.getDate())
      const endDay = new Date(e.getFullYear(), e.getMonth(), e.getDate())
      while (cursor <= endDay) {
        const key = toDayKey(cursor)
        const cell = dayMap.get(key) || { count: 0, items: [] }
        cell.count++
        cell.items.push(sp.item)
        dayMap.set(key, cell)
        cursor.setDate(cursor.getDate() + 1)
      }
    })

    const weeksArr: DayCell[][] = []
    const mlMap = new Map<number, string>()
    let currentWeek: DayCell[] = []
    let weekIdx = 0
    let prevMonth = -1
    const cursor = new Date(gridStart)

    while (cursor <= gridEnd) {
      const key = toDayKey(cursor)
      const cell = dayMap.get(key)
      const inYear = cursor.getFullYear() === selectedYear
      currentWeek.push({
        date: new Date(cursor),
        count: inYear ? (cell?.count || 0) : 0,
        items: inYear ? (cell?.items || []) : [],
        inYear,
      })
      if (cursor.getDate() === 1 && inYear) {
        const m = cursor.getMonth()
        if (m !== prevMonth) {
          mlMap.set(weekIdx, monthNames[m])
          prevMonth = m
        }
      }
      if (currentWeek.length === 7) {
        weeksArr.push(currentWeek)
        currentWeek = []
        weekIdx++
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    if (currentWeek.length > 0) weeksArr.push(currentWeek)

    let mx = 0
    dayMap.forEach((c, k) => {
      if (parseInt(k.split('-')[0]) === selectedYear && c.count > mx) mx = c.count
    })
    return { weeks: weeksArr, monthLabelMap: mlMap, maxCount: mx }
  }, [selectedYear, spans, monthNames])

  if (availableYears.length === 0) return null

  const todayKey = toDayKey(new Date())
  const numCols = weeks.length
  const colTemplate = `28px repeat(${numCols}, 1fr)`

  return (
    <div className="flex gap-4">
      <div className="flex-1 min-w-0 overflow-x-auto">
        <div style={{ minWidth: 600 }}>
          {/* Month labels — same grid columns so they align */}
          <div className="grid mb-1" style={{ gridTemplateColumns: colTemplate, columnGap: GAP }}>
            <div /> {/* spacer for day-label column */}
            {weeks.map((_, wIdx) => (
              <div key={wIdx} className="overflow-visible min-w-0">
                {monthLabelMap.has(wIdx) && (
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap leading-none">
                    {monthLabelMap.get(wIdx)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Main grid: day-label column + week columns, 7 rows auto-flow by column */}
          <TooltipProvider delayDuration={100}>
            <div
              className="grid"
              style={{
                gridTemplateColumns: colTemplate,
                gridTemplateRows: 'repeat(7, auto)',
                gridAutoFlow: 'column',
                gap: GAP,
              }}
            >
              {/* Day-of-week labels (7 items → fills first column) */}
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <div key={`dl-${d}`} className="flex items-center justify-end pr-1">
                  {d === 1 && <span className="text-[10px] text-muted-foreground leading-none">{t('dashboard:careerTimeline.heatmapMon')}</span>}
                  {d === 3 && <span className="text-[10px] text-muted-foreground leading-none">{t('dashboard:careerTimeline.heatmapWed')}</span>}
                  {d === 5 && <span className="text-[10px] text-muted-foreground leading-none">{t('dashboard:careerTimeline.heatmapFri')}</span>}
                </div>
              ))}

              {/* Cells: 53×7 items → fill columns 2+ */}
              {weeks.flatMap((week, wIdx) =>
                week.map((cell, dIdx) => {
                  if (!cell.inYear) {
                    return <div key={`${wIdx}-${dIdx}`} className="aspect-square" />
                  }
                  const level = getLevel(cell.count, maxCount)
                  const isFuture = toDayKey(cell.date) > todayKey
                  return (
                    <Tooltip key={`${wIdx}-${dIdx}`}>
                      <TooltipTrigger asChild>
                        <div className={`aspect-square rounded-sm ${LEVEL_CLASSES[level]} ${isFuture ? 'opacity-30' : ''}`} />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="font-medium text-xs">{formatDayDate(cell.date)}</p>
                        {cell.count === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {t('dashboard:careerTimeline.heatmapNoActivity')}
                          </p>
                        ) : (
                          <>
                            <p className="text-xs text-muted-foreground">
                              {t('dashboard:careerTimeline.heatmapItems', { count: cell.count })}
                            </p>
                            <div className="mt-1 space-y-0.5">
                              {cell.items.slice(0, 5).map((item, i) => (
                                <p key={i} className="text-[11px]">
                                  <span className="text-muted-foreground">{item.category}:</span> {item.label}
                                </p>
                              ))}
                              {cell.items.length > 5 && (
                                <p className="text-[11px] text-muted-foreground">+{cell.items.length - 5}</p>
                              )}
                            </div>
                          </>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  )
                }),
              )}
            </div>
          </TooltipProvider>

          {/* Legend */}
          <div className="flex items-center justify-end gap-1.5 mt-2">
            <span className="text-[10px] text-muted-foreground">{t('dashboard:careerTimeline.heatmapLess')}</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <div key={level} className={`w-3 h-3 rounded-sm ${LEVEL_CLASSES[level]}`} />
            ))}
            <span className="text-[10px] text-muted-foreground">{t('dashboard:careerTimeline.heatmapMore')}</span>
          </div>
        </div>
      </div>

      {/* Year selector */}
      <div className="flex flex-col gap-1 shrink-0 pt-4">
        {availableYears.map((year) => (
          <button
            key={year}
            onClick={() => setSelectedYear(year)}
            className={`text-xs px-2 py-0.5 rounded text-right transition-colors ${
              year === selectedYear
                ? 'font-bold text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {year}
          </button>
        ))}
      </div>
    </div>
  )
}
