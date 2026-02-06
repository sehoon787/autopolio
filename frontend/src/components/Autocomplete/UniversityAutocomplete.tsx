import { Input } from '@/components/ui/input'
import { lookupApi, UniversityResult } from '@/api/lookup'
import { useAutocomplete } from '@/hooks'
import { cn } from '@/lib/utils'
import { MapPin, Globe, ExternalLink } from 'lucide-react'

interface UniversityAutocompleteProps {
  value: string
  onChange: (name: string) => void
  onSelect?: (university: UniversityResult) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function UniversityAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  className,
  disabled,
}: UniversityAutocompleteProps) {
  const autocomplete = useAutocomplete<UniversityResult>({
    value,
    onChange,
    queryKey: ['universities-search', value],
    queryFn: () => lookupApi.searchUniversities(value, undefined, 10),
    minLength: 2,
    getResultKey: (result, index) => `${result.name}-${result.country_code}-${index}`,
    getResultLabel: (result) => result.name,
    onSelect,
  })

  const getCountryFlag = (countryCode: string) => {
    // Convert ISO country code to flag emoji
    if (!countryCode || countryCode.length !== 2) return '🏫'
    const code = countryCode.toUpperCase()
    const codePoints = [...code].map(char => 127397 + char.charCodeAt(0))
    try {
      return String.fromCodePoint(...codePoints)
    } catch {
      return '🏫'
    }
  }

  const formatLocation = (result: UniversityResult) => {
    const parts: string[] = []
    if (result.state) parts.push(result.state)
    if (result.country) parts.push(result.country)
    return parts.join(', ')
  }

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
              <span className="text-lg mt-0.5">{getCountryFlag(result.country_code)}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {result.name}
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {formatLocation(result)}
                  </span>
                </div>
                {result.domain && (
                  <div className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                    <Globe className="h-3 w-3 shrink-0" />
                    <span className="truncate">{result.domain}</span>
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

// Read-only university info display component
interface UniversityInfoDisplayProps {
  country?: string | null
  countryCode?: string | null
  state?: string | null
  domain?: string | null
  webPage?: string | null
  className?: string
}

export function UniversityInfoDisplay({
  country,
  countryCode,
  state,
  domain,
  webPage,
  className,
}: UniversityInfoDisplayProps) {
  const getCountryFlag = (code: string) => {
    if (!code || code.length !== 2) return '🌍'
    const codePoints = [...code.toUpperCase()].map(char => 127397 + char.charCodeAt(0))
    try {
      return String.fromCodePoint(...codePoints)
    } catch {
      return '🌍'
    }
  }

  // Don't render if no data
  if (!country && !state && !domain && !webPage) {
    return null
  }

  const location = [state, country].filter(Boolean).join(', ')

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2', className)}>
      {location && (
        <span className="flex items-center gap-1.5">
          <span>{getCountryFlag(countryCode || '')}</span>
          <span>{location}</span>
        </span>
      )}
      {domain && (
        <span className="flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5" />
          <span>{domain}</span>
        </span>
      )}
      {webPage && (
        <a
          href={webPage}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>Website</span>
        </a>
      )}
    </div>
  )
}
