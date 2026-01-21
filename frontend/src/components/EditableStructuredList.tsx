import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Pencil,
  Check,
  X,
  Plus,
  Trash2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

export interface StructuredItem {
  title: string
  items: string[]
}

interface EditableStructuredListProps {
  sections: StructuredItem[]
  onSave: (sections: StructuredItem[]) => Promise<void>
  onReset?: () => Promise<void>
  isModified?: boolean
  title?: string
  emptyMessage?: string
  className?: string
  // External control props
  isEditing?: boolean
  onEditingChange?: (editing: boolean) => void
  hideEditButton?: boolean
}

export function EditableStructuredList({
  sections,
  onSave,
  onReset,
  isModified = false,
  title,
  emptyMessage = '항목이 없습니다.',
  className = '',
  isEditing: externalIsEditing,
  onEditingChange,
  hideEditButton = false,
}: EditableStructuredListProps) {
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
  const [editedSections, setEditedSections] = useState<StructuredItem[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set())

  const startEditing = useCallback(() => {
    setEditedSections(sections.map(s => ({ ...s, items: [...s.items] })))
    setIsEditing(true)
    // Expand all sections in edit mode
    setExpandedSections(new Set(sections.map((_, i) => i)))
  }, [sections])

  // Initialize editedSections when external isEditing changes to true
  useEffect(() => {
    if (externalIsEditing !== undefined && externalIsEditing) {
      setEditedSections(sections.map(s => ({ ...s, items: [...s.items] })))
      setExpandedSections(new Set(sections.map((_, i) => i)))
    }
  }, [externalIsEditing]) // Only trigger when externalIsEditing changes

  const cancelEditing = useCallback(() => {
    setIsEditing(false)
    setEditedSections([])
  }, [])

  const saveChanges = useCallback(async () => {
    setIsSaving(true)
    try {
      // Filter out empty sections and items
      const cleanedSections = editedSections
        .filter(s => s.title.trim())
        .map(s => ({
          title: s.title.trim(),
          items: s.items.filter(item => item.trim())
        }))
      await onSave(cleanedSections)
      setIsEditing(false)
      setEditedSections([])
    } catch (error) {
      console.error('Failed to save:', error)
    } finally {
      setIsSaving(false)
    }
  }, [editedSections, onSave])

  const handleReset = useCallback(async () => {
    if (!onReset) return
    setIsSaving(true)
    try {
      await onReset()
      setIsEditing(false)
      setEditedSections([])
    } catch (error) {
      console.error('Failed to reset:', error)
    } finally {
      setIsSaving(false)
    }
  }, [onReset])

  const addSection = useCallback(() => {
    setEditedSections([...editedSections, { title: '', items: [''] }])
    setExpandedSections(prev => new Set([...prev, editedSections.length]))
  }, [editedSections])

  const removeSection = useCallback((index: number) => {
    setEditedSections(editedSections.filter((_, i) => i !== index))
  }, [editedSections])

  const updateSectionTitle = useCallback((index: number, title: string) => {
    const newSections = [...editedSections]
    newSections[index] = { ...newSections[index], title }
    setEditedSections(newSections)
  }, [editedSections])

  const addItem = useCallback((sectionIndex: number) => {
    const newSections = [...editedSections]
    newSections[sectionIndex] = {
      ...newSections[sectionIndex],
      items: [...newSections[sectionIndex].items, '']
    }
    setEditedSections(newSections)
  }, [editedSections])

  const removeItem = useCallback((sectionIndex: number, itemIndex: number) => {
    const newSections = [...editedSections]
    newSections[sectionIndex] = {
      ...newSections[sectionIndex],
      items: newSections[sectionIndex].items.filter((_, i) => i !== itemIndex)
    }
    setEditedSections(newSections)
  }, [editedSections])

  const updateItem = useCallback((sectionIndex: number, itemIndex: number, value: string) => {
    const newSections = [...editedSections]
    const newItems = [...newSections[sectionIndex].items]
    newItems[itemIndex] = value
    newSections[sectionIndex] = { ...newSections[sectionIndex], items: newItems }
    setEditedSections(newSections)
  }, [editedSections])

  const moveSection = useCallback((fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= editedSections.length) return
    const newSections = [...editedSections]
    const [removed] = newSections.splice(fromIndex, 1)
    newSections.splice(toIndex, 0, removed)
    setEditedSections(newSections)
  }, [editedSections])

  const toggleExpand = useCallback((index: number) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }, [])

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
                      수정됨
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
                  편집
                </Button>
              )}
            </div>
          )}

          {/* Sections list */}
          {sections.length > 0 ? (
            <div className="space-y-6">
              {sections.map((section, idx) => (
                <div key={idx} className="space-y-2">
                  <h4 className="font-semibold text-lg text-gray-900">
                    {idx + 1}. {section.title}
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 ml-2">
                    {section.items.map((item, itemIdx) => (
                      <li key={itemIdx} className="text-sm">{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">{emptyMessage}</p>
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
              원본으로
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
            취소
          </Button>
          <Button
            size="sm"
            onClick={saveChanges}
            disabled={isSaving}
            className="h-8"
          >
            <Check className="h-4 w-4 mr-1" />
            저장
          </Button>
        </div>
      </div>

      {/* Editable sections */}
      <div className="space-y-4 mb-4">
        {editedSections.map((section, sectionIdx) => (
          <div
            key={sectionIdx}
            className="border rounded-lg bg-white overflow-hidden"
          >
            {/* Section header */}
            <div className="flex items-center gap-2 p-3 bg-gray-50 border-b">
              {/* Move buttons */}
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => moveSection(sectionIdx, sectionIdx - 1)}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  disabled={sectionIdx === 0}
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveSection(sectionIdx, sectionIdx + 1)}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  disabled={sectionIdx === editedSections.length - 1}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              {/* Section number */}
              <span className="text-blue-600 font-bold w-6">{sectionIdx + 1}.</span>

              {/* Title input */}
              <Input
                value={section.title}
                onChange={(e) => updateSectionTitle(sectionIdx, e.target.value)}
                placeholder="섹션 제목..."
                className="flex-1 font-semibold"
              />

              {/* Expand/collapse */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleExpand(sectionIdx)}
                className="h-8 w-8 p-0"
              >
                {expandedSections.has(sectionIdx) ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>

              {/* Delete section */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeSection(sectionIdx)}
                className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Section items (collapsible) */}
            {expandedSections.has(sectionIdx) && (
              <div className="p-3 space-y-2">
                {section.items.map((item, itemIdx) => (
                  <div key={itemIdx} className="flex items-center gap-2">
                    <span className="text-gray-400 w-6 text-center">-</span>
                    <Input
                      value={item}
                      onChange={(e) => updateItem(sectionIdx, itemIdx, e.target.value)}
                      placeholder="항목 내용..."
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(sectionIdx, itemIdx)}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                      disabled={section.items.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addItem(sectionIdx)}
                  className="w-full mt-2 border-dashed border"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  항목 추가
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new section */}
      <Button
        variant="outline"
        size="sm"
        onClick={addSection}
        className="w-full border-dashed"
      >
        <Plus className="h-4 w-4 mr-1" />
        새 섹션 추가
      </Button>
    </div>
  )
}
