import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ArrowUp, ArrowDown } from 'lucide-react'

export interface SortOption {
  label: string
  value: string
  defaultOrder: 'asc' | 'desc'
}

interface SortDropdownProps {
  options: SortOption[]
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onSortChange: (sortBy: string, sortOrder: 'asc' | 'desc') => void
}

export function SortDropdown({ options, sortBy, sortOrder, onSortChange }: SortDropdownProps) {
  const { t } = useTranslation('common')

  const handleSortByChange = (value: string) => {
    const option = options.find((o) => o.value === value)
    onSortChange(value, option?.defaultOrder ?? 'desc')
  }

  const toggleDirection = () => {
    onSortChange(sortBy, sortOrder === 'asc' ? 'desc' : 'asc')
  }

  return (
    <div className="flex items-center border rounded-lg">
      <Select value={sortBy} onValueChange={handleSortByChange}>
        <SelectTrigger className="w-[160px] border-0 rounded-r-none shadow-none focus:ring-0">
          <SelectValue placeholder={t('sort.label')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleDirection}
        title={sortOrder === 'asc' ? t('sort.asc') : t('sort.desc')}
        className="h-9 w-9 shrink-0 rounded-l-none border-l"
      >
        {sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      </Button>
    </div>
  )
}
