import { useState, useCallback } from 'react'

export function useExpandableSection() {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  const toggleExpand = useCallback((key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const isExpanded = useCallback((key: string) => expandedSections.has(key), [expandedSections])

  return { expandedSections, toggleExpand, isExpanded }
}
