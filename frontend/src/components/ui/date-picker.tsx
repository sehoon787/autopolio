import * as React from "react"
import { useTranslation } from "react-i18next"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  minYear?: number
  maxYear?: number
}

export function DatePicker({
  value,
  onChange,
  disabled = false,
  className,
  minYear = 2000,
  maxYear = new Date().getFullYear() + 5,
}: DatePickerProps) {
  const { i18n } = useTranslation()
  const isKorean = i18n.language === 'ko'

  // Parse the current value (YYYY-MM-DD format)
  const [year, month, day] = React.useMemo(() => {
    if (!value) return ['', '', '']
    const parts = value.split('-')
    return parts.length === 3 ? parts : ['', '', '']
  }, [value])

  // Generate year options
  const years = React.useMemo(() => {
    const result = []
    for (let y = maxYear; y >= minYear; y--) {
      result.push(y.toString())
    }
    return result
  }, [minYear, maxYear])

  // Generate month options
  const months = React.useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const monthNum = (i + 1).toString().padStart(2, '0')
      return monthNum
    })
  }, [])

  // Generate day options based on selected year and month
  const days = React.useMemo(() => {
    if (!year || !month) return Array.from({ length: 31 }, (_, i) => (i + 1).toString().padStart(2, '0'))

    const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate()
    return Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString().padStart(2, '0'))
  }, [year, month])

  // Get month name for display
  const getMonthName = (monthNum: string) => {
    const monthIndex = parseInt(monthNum) - 1
    if (isKorean) {
      return `${parseInt(monthNum)}월`
    }
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return monthNames[monthIndex]
  }

  // Handle value changes
  const handleChange = (type: 'year' | 'month' | 'day', newValue: string) => {
    let newYear = year
    let newMonth = month
    let newDay = day

    if (type === 'year') newYear = newValue
    if (type === 'month') newMonth = newValue
    if (type === 'day') newDay = newValue

    // If all three are selected, output the date
    if (newYear && newMonth && newDay) {
      // Validate day is within bounds for the month
      const maxDay = new Date(parseInt(newYear), parseInt(newMonth), 0).getDate()
      if (parseInt(newDay) > maxDay) {
        newDay = maxDay.toString().padStart(2, '0')
      }
      onChange(`${newYear}-${newMonth}-${newDay}`)
    } else if (newYear || newMonth || newDay) {
      // Partial date - store what we have
      onChange([newYear, newMonth, newDay].filter(Boolean).join('-') || '')
    } else {
      onChange('')
    }
  }

  const yearLabel = isKorean ? '년' : 'Year'
  const monthLabel = isKorean ? '월' : 'Month'
  const dayLabel = isKorean ? '일' : 'Day'

  return (
    <div className={cn("flex gap-2", className)}>
      <Select
        value={year}
        onValueChange={(v) => handleChange('year', v)}
        disabled={disabled}
      >
        <SelectTrigger className="w-[90px]">
          <SelectValue placeholder={yearLabel} />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={y}>
              {isKorean ? `${y}년` : y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={month}
        onValueChange={(v) => handleChange('month', v)}
        disabled={disabled}
      >
        <SelectTrigger className="w-[80px]">
          <SelectValue placeholder={monthLabel} />
        </SelectTrigger>
        <SelectContent>
          {months.map((m) => (
            <SelectItem key={m} value={m}>
              {getMonthName(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={day}
        onValueChange={(v) => handleChange('day', v)}
        disabled={disabled}
      >
        <SelectTrigger className="w-[70px]">
          <SelectValue placeholder={dayLabel} />
        </SelectTrigger>
        <SelectContent>
          {days.map((d) => (
            <SelectItem key={d} value={d}>
              {isKorean ? `${parseInt(d)}일` : parseInt(d).toString()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
