import { useRef, ReactNode } from 'react'
import { useVirtualizer, VirtualItem as TanstackVirtualItem } from '@tanstack/react-virtual'
import { cn } from '@/lib/utils'

// Generic item interface for list items
export interface ListItem {
  id: string | number
}

// Props for the virtualized list
interface VirtualizedListProps<T extends ListItem> {
  items: T[]
  renderItem: (item: T, index: number, virtualItem: TanstackVirtualItem) => ReactNode
  estimateSize?: number
  overscan?: number
  className?: string
  itemClassName?: string
  gap?: number
  getItemKey?: (item: T, index: number) => string | number
}

// Main virtualized list component
export function VirtualizedList<T extends ListItem>({
  items,
  renderItem,
  estimateSize = 60,
  overscan = 5,
  className,
  itemClassName,
  gap = 0,
  getItemKey,
}: VirtualizedListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: getItemKey
      ? (index) => getItemKey(items[index], index)
      : (index) => items[index]?.id ?? index,
    gap,
  })

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div
      ref={parentRef}
      className={cn('h-full overflow-auto', className)}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index]
          return (
            <div
              key={virtualItem.key}
              className={itemClassName}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(item, virtualItem.index, virtualItem)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Props for variable size list
interface VariableSizeListProps<T extends ListItem> {
  items: T[]
  renderItem: (item: T, index: number, measureElement: (node: HTMLElement | null) => void) => ReactNode
  estimateSize?: number
  overscan?: number
  className?: string
  getItemKey?: (item: T, index: number) => string | number
}

// Variable size virtualized list (measures items dynamically)
export function VariableSizeList<T extends ListItem>({
  items,
  renderItem,
  estimateSize = 60,
  overscan = 5,
  className,
  getItemKey,
}: VariableSizeListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: getItemKey
      ? (index) => getItemKey(items[index], index)
      : (index) => items[index]?.id ?? index,
  })

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div
      ref={parentRef}
      className={cn('h-full overflow-auto', className)}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index]
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(item, virtualItem.index, virtualizer.measureElement)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Grid virtualized component props
interface VirtualizedGridProps<T extends ListItem> {
  items: T[]
  renderItem: (item: T, index: number) => ReactNode
  columns: number
  rowHeight?: number
  overscan?: number
  className?: string
  gap?: number
  getItemKey?: (item: T, index: number) => string | number
}

// Virtualized grid component
export function VirtualizedGrid<T extends ListItem>({
  items,
  renderItem,
  columns,
  rowHeight = 200,
  overscan = 2,
  className,
  gap = 16,
  getItemKey,
}: VirtualizedGridProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)

  // Calculate rows from items
  const rows = Math.ceil(items.length / columns)

  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight + gap,
    overscan,
    getItemKey: getItemKey
      ? (rowIndex) => {
          const startIdx = rowIndex * columns
          return items[startIdx] ? getItemKey(items[startIdx], startIdx) : rowIndex
        }
      : undefined,
  })

  const virtualRows = virtualizer.getVirtualItems()

  return (
    <div
      ref={parentRef}
      className={cn('h-full overflow-auto', className)}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualRows.map((virtualRow) => {
          const startIdx = virtualRow.index * columns
          const rowItems = items.slice(startIdx, startIdx + columns)

          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size - gap}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gap: `${gap}px`,
              }}
            >
              {rowItems.map((item, colIndex) => (
                <div key={item.id}>
                  {renderItem(item, startIdx + colIndex)}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Window-based virtualized list (for full page scrolling)
interface WindowVirtualizedListProps<T extends ListItem> {
  items: T[]
  renderItem: (item: T, index: number) => ReactNode
  estimateSize?: number
  overscan?: number
  className?: string
  getItemKey?: (item: T, index: number) => string | number
}

export function WindowVirtualizedList<T extends ListItem>({
  items,
  renderItem,
  estimateSize = 60,
  overscan = 5,
  className,
  getItemKey,
}: WindowVirtualizedListProps<T>) {
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => null, // Use window
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: getItemKey
      ? (index) => getItemKey(items[index], index)
      : (index) => items[index]?.id ?? index,
  })

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div
      className={className}
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        width: '100%',
        position: 'relative',
      }}
    >
      {virtualItems.map((virtualItem) => {
        const item = items[virtualItem.index]
        return (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderItem(item, virtualItem.index)}
          </div>
        )
      })}
    </div>
  )
}

// Hook for custom virtualization
export function useVirtualList<T extends ListItem>(
  items: T[],
  options: {
    parentRef: React.RefObject<HTMLElement>
    estimateSize?: number
    overscan?: number
    getItemKey?: (item: T, index: number) => string | number
  }
) {
  const { parentRef, estimateSize = 60, overscan = 5, getItemKey } = options

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: getItemKey
      ? (index) => getItemKey(items[index], index)
      : (index) => items[index]?.id ?? index,
  })

  return {
    virtualizer,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
    scrollToIndex: virtualizer.scrollToIndex,
    measureElement: virtualizer.measureElement,
  }
}
