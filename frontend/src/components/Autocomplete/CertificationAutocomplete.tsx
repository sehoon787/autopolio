import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { lookupApi, CertificationResult } from '@/api/lookup'
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
    queryKey: ['certifications-search', inputValue, i18n.language],
    queryFn: () =>
      lookupApi.searchCertifications(inputValue, i18n.language, undefined, 10),
    enabled: inputValue.length >= 1 && isOpen,
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

  const handleSelect = (result: CertificationResult) => {
    setInputValue(result.name)
    onChange(result.name, result.issuer)
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

  return (
    <div className={cn('relative', className)}>
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          // Delay to allow click on item
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
              key={result.id || `${result.name}-${index}`}
              className={cn(
                'flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-accent',
                highlightedIndex === index && 'bg-accent'
              )}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setHighlightedIndex(index)}
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
