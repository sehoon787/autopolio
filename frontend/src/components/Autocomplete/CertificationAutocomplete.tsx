import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { lookupApi, CertificationResult } from '@/api/lookup'
import { useAutocomplete } from '@/hooks'
import { cn } from '@/lib/utils'
import { Medal, Building2 } from 'lucide-react'

interface CertificationAutocompleteProps {
  value: string
  onChange: (name: string, issuer?: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function CertificationAutocomplete({
  value,
  onChange,
  placeholder,
  className,
  disabled,
}: CertificationAutocompleteProps) {
  const { i18n } = useTranslation()

  const autocomplete = useAutocomplete<CertificationResult>({
    value,
    onChange: (val) => onChange(val),
    queryKey: ['certifications-search', value, i18n.language],
    queryFn: () => lookupApi.searchCertifications(value, i18n.language, undefined, 10),
    minLength: 1,
    getResultKey: (result, index) => result.id || `${result.name}-${index}`,
    getResultLabel: (result) => result.name,
    onSelect: (result) => {
      // Call onChange with both name and issuer
      onChange(result.name, result.issuer)
    },
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
              <Medal className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{result.name}</div>
                {result.issuer && (
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    <span className="truncate">{result.issuer}</span>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
