import { useState, ReactNode } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Kanban item interface
export interface KanbanItem {
  id: string | number
  columnId: string
}

// Kanban column interface
export interface KanbanColumn {
  id: string
  title: string
  color?: string
  items: KanbanItem[]
}

// Column component
interface KanbanColumnProps {
  column: KanbanColumn
  renderItem: (item: KanbanItem) => ReactNode
  renderEmptyState?: () => ReactNode
}

function KanbanColumnComponent({
  column,
  renderItem,
  renderEmptyState,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  })

  return (
    <Card
      className={cn(
        'flex flex-col min-h-[400px] transition-colors',
        isOver && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{column.title}</CardTitle>
          <Badge
            variant="secondary"
            className={cn(
              'ml-2',
              column.color && `bg-${column.color}-100 text-${column.color}-700`
            )}
          >
            {column.items.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent
        ref={setNodeRef}
        className="flex-1 overflow-auto p-2"
      >
        <SortableContext
          items={column.items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2 min-h-[100px]">
            {column.items.length > 0 ? (
              column.items.map((item) => (
                <KanbanItemWrapper key={item.id} item={item}>
                  {renderItem(item)}
                </KanbanItemWrapper>
              ))
            ) : (
              <div className="text-center py-8 text-gray-400 text-sm">
                {renderEmptyState?.() || '항목 없음'}
              </div>
            )}
          </div>
        </SortableContext>
      </CardContent>
    </Card>
  )
}

// Kanban item wrapper
interface KanbanItemWrapperProps {
  item: KanbanItem
  children: ReactNode
}

function KanbanItemWrapper({ item, children }: KanbanItemWrapperProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'cursor-grab active:cursor-grabbing touch-none',
        isDragging && 'opacity-50'
      )}
    >
      {children}
    </div>
  )
}

// Main Kanban Board component
interface KanbanBoardProps<T extends KanbanItem> {
  columns: KanbanColumn[]
  onMove: (itemId: string | number, fromColumn: string, toColumn: string, newIndex: number) => void
  onReorder: (columnId: string, items: T[]) => void
  renderItem: (item: T) => ReactNode
  renderOverlay?: (item: T) => ReactNode
  renderEmptyState?: () => ReactNode
  className?: string
}

export function KanbanBoard<T extends KanbanItem>({
  columns,
  onMove,
  onReorder,
  renderItem,
  renderOverlay,
  renderEmptyState,
  className,
}: KanbanBoardProps<T>) {
  const [activeItem, setActiveItem] = useState<T | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Find item across all columns
  const findItem = (id: string | number): T | undefined => {
    for (const column of columns) {
      const item = column.items.find((i) => i.id === id)
      if (item) return item as T
    }
    return undefined
  }

  // Find column containing an item
  const findColumnByItemId = (id: string | number): KanbanColumn | undefined => {
    return columns.find((column) =>
      column.items.some((item) => item.id === id)
    )
  }

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const item = findItem(active.id as string | number)
    if (item) {
      setActiveItem(item)
    }
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id
    const overId = over.id

    // Find source and destination columns
    const activeColumn = findColumnByItemId(activeId as string | number)
    let overColumn = findColumnByItemId(overId as string | number)

    // If dropping on a column directly (not an item)
    if (!overColumn) {
      overColumn = columns.find((c) => c.id === overId)
    }

    if (!activeColumn || !overColumn || activeColumn.id === overColumn.id) {
      return
    }

    // Moving between columns - handled in dragEnd
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over) {
      setActiveItem(null)
      return
    }

    const activeId = active.id as string | number
    const overId = over.id as string | number

    const activeColumn = findColumnByItemId(activeId)
    let overColumn = findColumnByItemId(overId)

    // If dropping on a column directly
    if (!overColumn) {
      overColumn = columns.find((c) => c.id === overId)
    }

    if (!activeColumn || !overColumn) {
      setActiveItem(null)
      return
    }

    if (activeColumn.id === overColumn.id) {
      // Reordering within same column
      const oldIndex = activeColumn.items.findIndex((i) => i.id === activeId)
      const newIndex = activeColumn.items.findIndex((i) => i.id === overId)

      if (oldIndex !== newIndex && newIndex >= 0) {
        const newItems = arrayMove(activeColumn.items as T[], oldIndex, newIndex)
        onReorder(activeColumn.id, newItems)
      }
    } else {
      // Moving to different column
      const overIndex = overColumn.items.findIndex((i) => i.id === overId)
      const newIndex = overIndex >= 0 ? overIndex : overColumn.items.length
      onMove(activeId, activeColumn.id, overColumn.id, newIndex)
    }

    setActiveItem(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div
        className={cn(
          'grid gap-4',
          `grid-cols-${columns.length}`,
          className
        )}
        style={{
          gridTemplateColumns: `repeat(${columns.length}, minmax(280px, 1fr))`,
        }}
      >
        {columns.map((column) => (
          <KanbanColumnComponent
            key={column.id}
            column={column}
            renderItem={renderItem as (item: KanbanItem) => ReactNode}
            renderEmptyState={renderEmptyState}
          />
        ))}
      </div>
      <DragOverlay>
        {activeItem && renderOverlay ? (
          <div className="transform rotate-3 shadow-lg">
            {renderOverlay(activeItem)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

// Predefined project status columns for Autopolio
export const PROJECT_STATUS_COLUMNS = [
  { id: 'pending', title: '분석 대기', color: 'gray' },
  { id: 'analyzing', title: '분석 중', color: 'blue' },
  { id: 'review', title: '검토 필요', color: 'yellow' },
  { id: 'completed', title: '완료', color: 'green' },
]

// Helper function to create columns from items
export function createKanbanColumns<T extends KanbanItem>(
  items: T[],
  columnDefinitions: { id: string; title: string; color?: string }[]
): KanbanColumn[] {
  return columnDefinitions.map((def) => ({
    ...def,
    items: items.filter((item) => item.columnId === def.id),
  }))
}
