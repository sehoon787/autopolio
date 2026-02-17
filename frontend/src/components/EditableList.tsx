import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { InlineMarkdown } from '@/components/InlineMarkdown'
import {
  Pencil,
  Check,
  X,
  Plus,
  Trash2,
  RotateCcw,
} from 'lucide-react'

// Translation keys interface for type safety
interface EditorTranslations {
  modified?: string
  editBtn?: string
  cancel?: string
  save?: string
  resetToOriginal?: string
  newItemPlaceholder?: string
  addItem?: string
  noItems?: string
}

interface EditableListProps {
  items: string[]
  onSave: (items: string[]) => Promise<void>
  onReset?: () => Promise<void>
  isModified?: boolean
  title?: string
  emptyMessage?: string
  itemPrefix?: string // e.g., "(1)", "•"
  className?: string
  // External control props
  isEditing?: boolean
  onEditingChange?: (editing: boolean) => void
  hideEditButton?: boolean
  // Translation props
  translations?: EditorTranslations
}

// Default translations (Korean as fallback for backwards compatibility)
const defaultTranslations: EditorTranslations = {
  modified: '수정됨',
  editBtn: '편집',
  cancel: '취소',
  save: '저장',
  resetToOriginal: '원본으로',
  newItemPlaceholder: '새 항목 추가...',
  addItem: '추가',
  noItems: '항목이 없습니다.',
}

export function EditableList({
  items,
  onSave,
  onReset,
  isModified = false,
  title,
  emptyMessage,
  itemPrefix,
  className = '',
  isEditing: externalIsEditing,
  onEditingChange,
  hideEditButton = false,
  translations = {},
}: EditableListProps) {
  // Merge translations with defaults
  const t = { ...defaultTranslations, ...translations }
  const actualEmptyMessage = emptyMessage ?? t.noItems
  const [internalIsEditing, setInternalIsEditing] = useState(false)

  // Use external control if provided, otherwise use internal state
  const isEditing = externalIsEditing !== undefined ? externalIsEditing : internalIsEditing
  const setIsEditing = (value: boolean) => {
    if (onEditingChange) {
      onEditingChange(value)
    } else {
      setInternalIsEditing(value)
    }
  }
  const [editedItems, setEditedItems] = useState<string[]>([])
  const [newItem, setNewItem] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState('')

  const startEditing = useCallback(() => {
    setEditedItems([...items])
    setIsEditing(true)
    setNewItem('')
  }, [items])

  // Initialize editedItems when external isEditing changes to true
  useEffect(() => {
    if (externalIsEditing !== undefined && externalIsEditing) {
      setEditedItems([...items])
    }
  }, [externalIsEditing]) // Only trigger when externalIsEditing changes

  const cancelEditing = useCallback(() => {
    setIsEditing(false)
    setEditedItems([])
    setNewItem('')
    setEditingIndex(null)
    setEditingValue('')
  }, [])

  const saveChanges = useCallback(async () => {
    setIsSaving(true)
    try {
      await onSave(editedItems)
      setIsEditing(false)
      setEditedItems([])
    } catch (error) {
      console.error('Failed to save:', error)
    } finally {
      setIsSaving(false)
    }
  }, [editedItems, onSave])

  const handleReset = useCallback(async () => {
    if (!onReset) return
    setIsSaving(true)
    try {
      await onReset()
      setIsEditing(false)
      setEditedItems([])
    } catch (error) {
      console.error('Failed to reset:', error)
    } finally {
      setIsSaving(false)
    }
  }, [onReset])

  const addItem = useCallback(() => {
    if (newItem.trim()) {
      setEditedItems([...editedItems, newItem.trim()])
      setNewItem('')
    }
  }, [editedItems, newItem])

  const removeItem = useCallback((index: number) => {
    setEditedItems(editedItems.filter((_, i) => i !== index))
  }, [editedItems])

  const startEditingItem = useCallback((index: number, value: string) => {
    setEditingIndex(index)
    setEditingValue(value)
  }, [])

  const saveEditingItem = useCallback(() => {
    if (editingIndex !== null && editingValue.trim()) {
      const newItems = [...editedItems]
      newItems[editingIndex] = editingValue.trim()
      setEditedItems(newItems)
    }
    setEditingIndex(null)
    setEditingValue('')
  }, [editedItems, editingIndex, editingValue])

  const cancelEditingItem = useCallback(() => {
    setEditingIndex(null)
    setEditingValue('')
  }, [])

  const moveItem = useCallback((fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= editedItems.length) return
    const newItems = [...editedItems]
    const [removed] = newItems.splice(fromIndex, 1)
    newItems.splice(toIndex, 0, removed)
    setEditedItems(newItems)
  }, [editedItems])

  const getPrefix = (index: number) => {
    if (!itemPrefix) return null
    if (itemPrefix === '(n)') return `(${index + 1})`
    return itemPrefix
  }

  // View mode
  if (!isEditing) {
    return (
      <div className={`relative ${className}`}>
        {/* Modified indicator */}
        {isModified && (
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-400 rounded-l" />
        )}

        <div className={isModified ? 'pl-3' : ''}>
          {/* Header with edit button - only show if not hidden and has title or should show button */}
          {(!hideEditButton || title) && (
            <div className="flex items-center justify-between mb-3">
              {title && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">{title}</span>
                  {isModified && (
                    <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">
                      {t.modified}
                    </Badge>
                  )}
                </div>
              )}
              {!hideEditButton && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startEditing}
                  className="h-8 text-gray-500 hover:text-gray-700"
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  {t.editBtn}
                </Button>
              )}
            </div>
          )}

          {/* Items list */}
          {items.length > 0 ? (
            <ul className="space-y-2">
              {items.map((item, index) => (
                <li key={index} className="flex items-start gap-2">
                  {getPrefix(index) && (
                    <span className="text-blue-500 font-medium shrink-0">
                      {getPrefix(index)}
                    </span>
                  )}
                  <InlineMarkdown>{item}</InlineMarkdown>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">{actualEmptyMessage}</p>
          )}
        </div>
      </div>
    )
  }

  // Edit mode
  return (
    <div className={`relative border-2 border-blue-200 rounded-lg p-4 bg-blue-50/30 ${className}`}>
      {/* Header with actions */}
      <div className="flex items-center justify-between mb-4">
        {title && <span className="font-medium">{title}</span>}
        <div className="flex items-center gap-2">
          {isModified && onReset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={isSaving}
              className="h-8 text-orange-600 hover:text-orange-700"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              {t.resetToOriginal}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={cancelEditing}
            disabled={isSaving}
            className="h-8"
          >
            <X className="h-4 w-4 mr-1" />
            {t.cancel}
          </Button>
          <Button
            size="sm"
            onClick={saveChanges}
            disabled={isSaving}
            className="h-8"
          >
            <Check className="h-4 w-4 mr-1" />
            {t.save}
          </Button>
        </div>
      </div>

      {/* Editable items */}
      <div className="space-y-2 mb-4">
        {editedItems.map((item, index) => (
          <div key={index} className="flex items-center gap-2 group">
            {/* Drag handle */}
            <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => moveItem(index, index - 1)}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                disabled={index === 0}
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => moveItem(index, index + 1)}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                disabled={index === editedItems.length - 1}
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {/* Index */}
            <span className="text-blue-500 font-medium w-8 text-center shrink-0">
              {getPrefix(index) || `${index + 1}.`}
            </span>

            {/* Item content */}
            {editingIndex === index ? (
              <div className="flex-1 flex items-center gap-2">
                <Input
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEditingItem()
                    if (e.key === 'Escape') cancelEditingItem()
                  }}
                  className="flex-1"
                  autoFocus
                />
                <Button size="sm" variant="ghost" onClick={saveEditingItem}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEditingItem}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                className="flex-1 py-2 px-3 bg-white rounded border cursor-pointer hover:bg-gray-50"
                onClick={() => startEditingItem(index, item)}
              >
                {item}
              </div>
            )}

            {/* Delete button */}
            {editingIndex !== index && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeItem(index)}
                className="h-8 w-8 p-0 text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Add new item */}
      <div className="flex items-center gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addItem()
          }}
          placeholder={t.newItemPlaceholder}
          className="flex-1"
        />
        <Button variant="outline" size="sm" onClick={addItem} disabled={!newItem.trim()}>
          <Plus className="h-4 w-4 mr-1" />
          {t.addItem}
        </Button>
      </div>
    </div>
  )
}
