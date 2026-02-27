/**
 * Shared utilities for timeline components.
 * Converts dates to percent positions for horizontal bar rendering.
 */

import type { Certification, Award, Education, Publication, VolunteerActivity } from '@/api/credentials'

// ── Shared types ──

export interface CredentialData {
  certifications: Certification[]
  awards: Award[]
  educations: Education[]
  publications: Publication[]
  volunteerActivities: VolunteerActivity[]
}

// ── Layout constants ──

/** CSS classes for the left label column width in timeline rows. */
export const LABEL_COL_CLASS = 'w-[140px] lg:w-[180px]'

/** Minimum bar width percentage to prevent invisible bars. */
export const MIN_BAR_WIDTH_PCT = 1

/** Minimum bar width percentage to show inline text label. */
export const BAR_LABEL_THRESHOLD_PCT = 8

/** Maximum items shown in a tooltip before truncation. */
export const MAX_TOOLTIP_ITEMS = 5

/** Range padding in months for timeline visual breathing room. */
const RANGE_PADDING_MONTHS = 6

// ── Sort utility ──

/** Sort items by date ascending, nulls last. */
export const sortByDate = (a: { date: string | null }, b: { date: string | null }) => {
  if (a.date && b.date) return new Date(a.date).getTime() - new Date(b.date).getTime()
  if (a.date) return -1
  if (b.date) return 1
  return 0
}

/** Calculate the overall start/end range from a list of date strings. */
export function getTimelineRange(dates: (string | null | undefined)[]): { start: Date; end: Date } {
  const now = new Date()
  const parsed = dates
    .filter((d): d is string => !!d)
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d.getTime()))

  if (parsed.length === 0) {
    return { start: new Date(now.getFullYear() - 1, 0, 1), end: now }
  }

  const min = new Date(Math.min(...parsed.map((d) => d.getTime())))
  const max = new Date(Math.max(...parsed.map((d) => d.getTime())))

  const start = new Date(min.getFullYear(), min.getMonth() - RANGE_PADDING_MONTHS, 1)
  const end = max > now
    ? new Date(max.getFullYear(), max.getMonth() + RANGE_PADDING_MONTHS, 1)
    : new Date(now.getFullYear(), now.getMonth() + RANGE_PADDING_MONTHS, 1)

  return { start, end }
}

/** Convert a date to a percentage position within the range. */
export function dateToPercent(date: Date, rangeStart: Date, rangeEnd: Date): number {
  const total = rangeEnd.getTime() - rangeStart.getTime()
  if (total <= 0) return 0
  const pos = date.getTime() - rangeStart.getTime()
  return Math.max(0, Math.min(100, (pos / total) * 100))
}

/** Generate year tick values between start and end dates. */
export function generateYearTicks(start: Date, end: Date): number[] {
  const years: number[] = []
  const startYear = start.getFullYear()
  const endYear = end.getFullYear()
  for (let y = startYear; y <= endYear; y++) {
    years.push(y)
  }
  return years
}

/** Parse a raw date string (possibly pipe-delimited) into a valid date segment or null. */
export function parseValidDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const segment = raw.split('|')[0].trim()
  if (!segment) return null
  const d = new Date(segment)
  if (isNaN(d.getTime())) return null
  return segment
}

/** Format a date string as yyyy.MM */
export function formatDate(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${yyyy}.${mm}`
}
