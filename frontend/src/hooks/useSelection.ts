import { useState, useCallback, useMemo } from 'react'

/**
 * Generic selection state management hook
 * @template T - The type of item identifiers (usually number or string)
 */
export function useSelection<T>() {
  const [selectedIds, setSelectedIds] = useState<Set<T>>(new Set())

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds])

  const isSelected = useCallback((id: T) => selectedIds.has(id), [selectedIds])

  const toggle = useCallback((id: T) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const select = useCallback((id: T) => {
    setSelectedIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const deselect = useCallback((id: T) => {
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const selectAll = useCallback((ids: T[]) => {
    setSelectedIds(new Set(ids))
  }, [])

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const toggleAll = useCallback((allIds: T[]) => {
    setSelectedIds((prev) => {
      if (prev.size === allIds.length && allIds.every((id) => prev.has(id))) {
        return new Set()
      }
      return new Set(allIds)
    })
  }, [])

  const getSelectedArray = useCallback(() => Array.from(selectedIds), [selectedIds])

  return {
    selectedIds,
    selectedCount,
    isSelected,
    toggle,
    select,
    deselect,
    selectAll,
    deselectAll,
    toggleAll,
    getSelectedArray,
  }
}

export type UseSelectionReturn<T> = ReturnType<typeof useSelection<T>>
