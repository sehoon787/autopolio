import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery, QueryKey } from '@tanstack/react-query'

/**
 * Generic autocomplete hook that handles:
 * - Input value state and syncing with external value prop
 * - Dropdown open/close state
 * - Keyboard navigation (ArrowUp, ArrowDown, Enter, Escape)
 * - Highlighted item scrolling into view
 * 
 * Usage:
 * ```tsx
 * const autocomplete = useAutocomplete({
 *   value: 'initial value',
 *   onChange: (val) => console.log(val),
 *   queryKey: ['search', inputValue],
 *   queryFn: () => api.search(inputValue),
 *   enabled: inputValue.length >= 2,
 *   getResultKey: (item) => item.id,
 *   getResultLabel: (item) => item.name,
 *   onSelect: (item) => console.log('selected', item),
 * })
 * 
 * return (
 *   <div className="relative">
 *     <Input {...autocomplete.inputProps} />
 *     {autocomplete.isOpen && autocomplete.results.length > 0 && (
 *       <ul ref={autocomplete.listRef}>
 *         {autocomplete.results.map((item, index) => (
 *           <li
 *             key={autocomplete.getResultKey(item, index)}
 *             {...autocomplete.getItemProps(index)}
 *           >
 *             {item.name}
 *           </li>
 *         ))}
 *       </ul>
 *     )}
 *   </div>
 * )
 * ```
 */

export interface UseAutocompleteOptions<TResult, TData = TResult[]> {
  /** Current value (controlled) */
  value: string
  /** Called when input value changes */
  onChange: (value: string) => void
  /** Query key for React Query */
  queryKey: QueryKey
  /** Query function for React Query */
  queryFn: () => Promise<{ data: TData }>
  /** Extract results array from query data */
  getResults?: (data: TData) => TResult[]
  /** Whether query is enabled */
  enabled?: boolean
  /** Minimum input length to enable query (default: 1) */
  minLength?: number
  /** Stale time for query (default: 30000) */
  staleTime?: number
  /** Get unique key for result item */
  getResultKey: (result: TResult, index: number) => string | number
  /** Get display label for result item (used for setting input value on select) */
  getResultLabel: (result: TResult) => string
  /** Called when an item is selected */
  onSelect?: (result: TResult) => void
}

export interface UseAutocompleteReturn<TResult> {
  /** Current input value */
  inputValue: string
  /** Whether dropdown is open */
  isOpen: boolean
  /** Currently highlighted index (-1 if none) */
  highlightedIndex: number
  /** Query results */
  results: TResult[]
  /** Is query loading */
  isLoading: boolean
  /** Ref for the input element */
  inputRef: React.RefObject<HTMLInputElement>
  /** Ref for the list element */
  listRef: React.RefObject<HTMLUListElement>
  /** Props to spread on Input component */
  inputProps: {
    ref: React.RefObject<HTMLInputElement>
    value: string
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    onFocus: () => void
    onBlur: () => void
    onKeyDown: (e: React.KeyboardEvent) => void
    autoComplete: 'off'
  }
  /** Get key for result item */
  getResultKey: (result: TResult, index: number) => string | number
  /** Get props to spread on list item */
  getItemProps: (index: number) => {
    onClick: () => void
    onMouseEnter: () => void
    className?: string
  }
  /** Check if index is highlighted */
  isHighlighted: (index: number) => boolean
  /** Manually select an item */
  selectItem: (result: TResult) => void
  /** Manually close dropdown */
  close: () => void
  /** Manually open dropdown */
  open: () => void
}

export function useAutocomplete<TResult, TData = { results: TResult[] }>({
  value,
  onChange,
  queryKey,
  queryFn,
  getResults = (data) => (data as any)?.results || [],
  enabled = true,
  minLength = 1,
  staleTime = 30000,
  getResultKey,
  getResultLabel,
  onSelect,
}: UseAutocompleteOptions<TResult, TData>): UseAutocompleteReturn<TResult> {
  const [inputValue, setInputValue] = useState(value)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Sync input value with prop
  useEffect(() => {
    setInputValue(value)
  }, [value])

  // Query
  const { data: queryData, isLoading } = useQuery({
    queryKey,
    queryFn,
    enabled: enabled && inputValue.length >= minLength && isOpen,
    staleTime,
  })

  const results = useMemo(() => {
    if (!queryData?.data) return []
    return getResults(queryData.data)
  }, [queryData, getResults])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement
      if (item) {
        item.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    onChange(newValue)
    setIsOpen(true)
    setHighlightedIndex(-1)
  }, [onChange])

  const selectItem = useCallback((result: TResult) => {
    const label = getResultLabel(result)
    setInputValue(label)
    onChange(label)
    onSelect?.(result)
    setIsOpen(false)
    setHighlightedIndex(-1)
  }, [getResultLabel, onChange, onSelect])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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
          selectItem(results[highlightedIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        setHighlightedIndex(-1)
        break
    }
  }, [isOpen, results, highlightedIndex, selectItem])

  const handleFocus = useCallback(() => {
    setIsOpen(true)
  }, [])

  const handleBlur = useCallback(() => {
    // Delay to allow click on item
    setTimeout(() => setIsOpen(false), 200)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setHighlightedIndex(-1)
  }, [])

  const open = useCallback(() => {
    setIsOpen(true)
  }, [])

  const isHighlighted = useCallback((index: number) => {
    return highlightedIndex === index
  }, [highlightedIndex])

  const getItemProps = useCallback((index: number) => ({
    onClick: () => selectItem(results[index]),
    onMouseEnter: () => setHighlightedIndex(index),
  }), [results, selectItem])

  const inputProps = useMemo(() => ({
    ref: inputRef,
    value: inputValue,
    onChange: handleInputChange,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    autoComplete: 'off' as const,
  }), [inputValue, handleInputChange, handleFocus, handleBlur, handleKeyDown])

  return {
    inputValue,
    isOpen,
    highlightedIndex,
    results,
    isLoading,
    inputRef,
    listRef,
    inputProps,
    getResultKey,
    getItemProps,
    isHighlighted,
    selectItem,
    close,
    open,
  }
}
