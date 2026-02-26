import { useState, useMemo, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { AxiosResponse } from 'axios'

/**
 * Sort option types available for credential lists
 */
export type SortOption = 'dateDesc' | 'dateAsc' | 'nameAsc' | 'nameDesc' | 'manual'

/**
 * Base interface for sortable items
 */
export interface SortableItem {
  id: number
  name?: string
  title?: string  // For publications
  school_name?: string  // For educations
  display_order: number
}

/**
 * Configuration for date field extraction
 */
export interface DateFieldConfig {
  /** Primary date field name (e.g., 'issue_date', 'award_date', 'start_date') */
  dateField: string
}

/**
 * Configuration options for useSortableList hook
 */
export interface UseSortableListOptions<TItem extends SortableItem> {
  /** Items to sort */
  items: TItem[]
  /** Query key for cache invalidation */
  queryKey: string
  /** Reorder API function */
  reorderApi: (userId: number, itemIds: number[]) => Promise<AxiosResponse<TItem[]>>
  /** Date field configuration for sorting */
  dateConfig: DateFieldConfig
  /** Initial sort option (default: 'dateDesc') */
  initialSort?: SortOption
  /** Custom name getter for items (default: item.name || item.title || item.school_name) */
  getItemName?: (item: TItem) => string
  /** Custom date getter for items */
  getItemDate?: (item: TItem) => string | null | undefined
}

/**
 * Return type for useSortableList hook
 */
export interface UseSortableListReturn<TItem extends SortableItem> {
  /** Currently selected sort option */
  sortBy: SortOption
  /** Function to change sort option */
  setSortBy: (option: SortOption) => void
  /** Sorted items array */
  sortedItems: TItem[]
  /** Move item up in manual order */
  handleMoveUp: (index: number) => void
  /** Move item down in manual order */
  handleMoveDown: (index: number) => void
  /** Whether reorder mutation is in progress */
  isReordering: boolean
}

/**
 * Default function to get item name
 */
function defaultGetItemName(item: SortableItem): string {
  return item.name || item.title || item.school_name || ''
}

/**
 * Hook for sortable list functionality with manual reordering
 * 
 * Provides:
 * - Multiple sort options (date ascending/descending, name ascending/descending, manual)
 * - Manual reorder with up/down buttons
 * - Optimistic updates for smooth UX
 * 
 * @example
 * ```tsx
 * const sort = useSortableList({
 *   items: crud.items,
 *   queryKey: 'certifications',
 *   reorderApi: certificationsApi.reorder,
 *   dateConfig: { dateField: 'issue_date' },
 * })
 * ```
 */
export function useSortableList<TItem extends SortableItem>(
  options: UseSortableListOptions<TItem>
): UseSortableListReturn<TItem> {
  const {
    items,
    queryKey,
    reorderApi,
    dateConfig,
    initialSort = 'dateDesc',
    getItemName = defaultGetItemName,
    getItemDate,
  } = options

  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()

  const [sortBy, setSortBy] = useState<SortOption>(initialSort)

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: (itemIds: number[]) => reorderApi(user!.id, itemIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  // Get date value from item
  const getDateValue = useCallback((item: TItem): string => {
    if (getItemDate) {
      return getItemDate(item) || ''
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (item as any)[dateConfig.dateField] || ''
  }, [dateConfig.dateField, getItemDate])

  // Sort items based on selected option
  const sortedItems = useMemo(() => {
    const itemsCopy = [...items]
    
    switch (sortBy) {
      case 'dateDesc':
        return itemsCopy.sort((a, b) => 
          getDateValue(b).localeCompare(getDateValue(a))
        )
      case 'dateAsc':
        return itemsCopy.sort((a, b) => 
          getDateValue(a).localeCompare(getDateValue(b))
        )
      case 'nameAsc':
        return itemsCopy.sort((a, b) => 
          getItemName(a).localeCompare(getItemName(b))
        )
      case 'nameDesc':
        return itemsCopy.sort((a, b) => 
          getItemName(b).localeCompare(getItemName(a))
        )
      case 'manual':
      default:
        return itemsCopy.sort((a, b) => a.display_order - b.display_order)
    }
  }, [items, sortBy, getDateValue, getItemName])

  // Move item up in list
  const handleMoveUp = useCallback((index: number) => {
    if (sortBy !== 'manual' || index === 0) return
    const newItems = [...sortedItems]
    const temp = newItems[index]
    newItems[index] = newItems[index - 1]
    newItems[index - 1] = temp
    reorderMutation.mutate(newItems.map(item => item.id))
  }, [sortBy, sortedItems, reorderMutation])

  // Move item down in list
  const handleMoveDown = useCallback((index: number) => {
    if (sortBy !== 'manual' || index === sortedItems.length - 1) return
    const newItems = [...sortedItems]
    const temp = newItems[index]
    newItems[index] = newItems[index + 1]
    newItems[index + 1] = temp
    reorderMutation.mutate(newItems.map(item => item.id))
  }, [sortBy, sortedItems, reorderMutation])

  return {
    sortBy,
    setSortBy,
    sortedItems,
    handleMoveUp,
    handleMoveDown,
    isReordering: reorderMutation.isPending,
  }
}

/**
 * Pre-configured sort options for common use cases
 */
export const SORT_OPTIONS = {
  dateDesc: 'credentials:sort.dateDesc',
  dateAsc: 'credentials:sort.dateAsc',
  nameAsc: 'credentials:sort.nameAsc',
  nameDesc: 'credentials:sort.nameDesc',
  manual: 'credentials:sort.manual',
} as const
