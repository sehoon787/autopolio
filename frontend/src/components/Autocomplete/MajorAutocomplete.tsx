import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { lookupApi, MajorResult } from '@/api/lookup'
import { useAutocomplete } from '@/hooks'
import { cn } from '@/lib/utils'
import { BookOpen } from 'lucide-react'

interface MajorAutocompleteProps {
  value: string
  onChange: (name: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function MajorAutocomplete({
  value,
  onChange,
  placeholder,
  className,
  disabled,
}: MajorAutocompleteProps) {
  const { i18n } = useTranslation()

  const autocomplete = useAutocomplete<MajorResult>({
    value,
    onChange,
    queryKey: ['majors-search', value],
    queryFn: () => lookupApi.searchMajors(value, 10),
    minLength: 1,
    getResultKey: (result, index) => `${result.name}-${index}`,
    getResultLabel: (result) => 
      i18n.language === 'ko' ? result.name : result.name_en,
  })

  return (
    <div className={cn('relative', className)}>
      <Input
        {...autocomplete.inputProps}
        placeholder={placeholder}
        disabled={disabled}
      />

      {autocomplete.isOpen && autocomplete.results.length > 0 && (
        <ul
          ref={autocomplete.listRef}
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border bg-popover shadow-lg"
        >
          {autocomplete.results.map((result, index) => (
            <li
              key={autocomplete.getResultKey(result, index)}
              className={cn(
                'flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-accent',
                autocomplete.isHighlighted(index) && 'bg-accent'
              )}
              {...autocomplete.getItemProps(index)}
            >
              <BookOpen className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {i18n.language === 'ko' ? result.name : result.name_en}
                </div>
                <div className="text-sm text-muted-foreground truncate">
                  {i18n.language === 'ko' ? result.name_en : result.name}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
