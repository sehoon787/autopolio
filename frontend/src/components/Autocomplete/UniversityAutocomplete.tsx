import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { lookupApi, UniversityResult } from '@/api/lookup'
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
  const [inputValue, setInputValue] = useState(value)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Sync input value with prop
  useEffect(() => {
    setInputValue(value)
  }, [value])

  // Search query
  const { data: searchResults } = useQuery({
    queryKey: ['universities-search', inputValue],
    queryFn: () => lookupApi.searchUniversities(inputValue, undefined, 10),
    enabled: inputValue.length >= 2 && isOpen,
    staleTime: 30000,
  })

  const results = searchResults?.data?.results || []

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    onChange(newValue)
    setIsOpen(true)
    setHighlightedIndex(-1)
  }

  const handleSelect = (result: UniversityResult) => {
    setInputValue(result.name)
    onChange(result.name)
    // Pass full university data to parent
    if (onSelect) {
      onSelect(result)
    }
    setIsOpen(false)
    setHighlightedIndex(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < results.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < results.length) {
          handleSelect(results[highlightedIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        setHighlightedIndex(-1)
        break
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement
      if (item) {
        item.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex])

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
        ref={inputRef}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          setTimeout(() => setIsOpen(false), 200)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />

      {isOpen && results.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border bg-popover shadow-lg"
        >
          {results.map((result, index) => (
            <li
              key={`${result.name}-${result.country_code}-${index}`}
              className={cn(
                'flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-accent',
                highlightedIndex === index && 'bg-accent'
              )}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setHighlightedIndex(index)}
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
