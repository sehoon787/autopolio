import { useState, ReactNode } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
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
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

// Generic item type
export interface SortableItem {
  id: string | number
}

// Props for the sortable item wrapper
interface SortableItemWrapperProps {
  id: string | number
  children: ReactNode
  className?: string
  disabled?: boolean
}

// Sortable item wrapper component
export function SortableItemWrapper({
  id,
  children,
  className,
  disabled = false,
}: SortableItemWrapperProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative',
        isDragging && 'opacity-50 z-50',
        className
      )}
      {...attributes}
    >
      <div className="flex items-center gap-2">
        {!disabled && (
          <button
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded touch-none"
            type="button"
          >
            <GripVertical className="h-4 w-4 text-gray-400" />
          </button>
        )}
        <div className="flex-1">{children}</div>
      </div>
    </div>
  )
}

// Props for the sortable list
interface SortableListProps<T extends SortableItem> {
  items: T[]
  onReorder: (items: T[]) => void
  renderItem: (item: T, index: number) => ReactNode
  renderOverlay?: (item: T) => ReactNode
  className?: string
  itemClassName?: string
  disabled?: boolean
}

// Sortable list component
export function SortableList<T extends SortableItem>({
  items,
  onReorder,
  renderItem,
  renderOverlay,
  className,
  itemClassName,
  disabled = false,
}: SortableListProps<T>) {
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

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const item = items.find((i) => i.id === active.id)
    if (item) {
      setActiveItem(item)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.id === active.id)
      const newIndex = items.findIndex((i) => i.id === over.id)
      const newItems = arrayMove(items, oldIndex, newIndex)
      onReorder(newItems)
    }

    setActiveItem(null)
  }

  const handleDragCancel = () => {
    setActiveItem(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        <div className={cn('space-y-2', className)}>
          {items.map((item, index) => (
            <SortableItemWrapper
              key={item.id}
              id={item.id}
              className={itemClassName}
              disabled={disabled}
            >
              {renderItem(item, index)}
            </SortableItemWrapper>
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeItem && renderOverlay ? (
          <div className="bg-white shadow-lg rounded-lg border p-2">
            {renderOverlay(activeItem)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

// Simple reorderable list (without drag handle visible, entire item is draggable)
interface ReorderableListProps<T extends SortableItem> {
  items: T[]
  onReorder: (items: T[]) => void
  renderItem: (item: T, index: number, isDragging: boolean) => ReactNode
  className?: string
}

function ReorderableItemWrapper<T extends SortableItem>({
  item,
  index,
  renderItem,
}: {
  item: T
  index: number
  renderItem: (item: T, index: number, isDragging: boolean) => ReactNode
}) {
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
        'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-50 z-50'
      )}
    >
      {renderItem(item, index, isDragging)}
    </div>
  )
}

export function ReorderableList<T extends SortableItem>({
  items,
  onReorder,
  renderItem,
  className,
}: ReorderableListProps<T>) {
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.id === active.id)
      const newIndex = items.findIndex((i) => i.id === over.id)
      const newItems = arrayMove(items, oldIndex, newIndex)
      onReorder(newItems)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={cn('space-y-2', className)}>
          {items.map((item, index) => (
            <ReorderableItemWrapper
              key={item.id}
              item={item}
              index={index}
              renderItem={renderItem}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
