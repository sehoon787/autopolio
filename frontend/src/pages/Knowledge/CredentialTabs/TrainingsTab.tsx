import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUserStore } from '@/stores/userStore'
import { educationsApi, Education, EducationCreate } from '@/api/credentials'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, BookOpen, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import { AttachmentUpload } from '@/components/AttachmentUpload'
import { useCrudOperations } from '@/hooks/useCrudOperations'
import { useSortableList, SortOption, SORT_OPTIONS } from '@/hooks/useSortableList'

// Training/Course degree options (non-formal education)
const TRAINING_DEGREE_OPTIONS = [
  { value: 'certificate', label: 'credentials:trainings.degrees.certificate' },
  { value: 'bootcamp', label: 'credentials:trainings.degrees.bootcamp' },
  { value: 'course', label: 'credentials:trainings.degrees.course' },
  { value: 'workshop', label: 'credentials:trainings.degrees.workshop' },
  { value: 'other', label: 'credentials:trainings.degrees.other' },
]

const trainingDegreeValues = TRAINING_DEGREE_OPTIONS.map((opt) => opt.value)

// Initial form data for trainings
const INITIAL_FORM_DATA: EducationCreate = {
  school_name: '',
  major: '',
  degree: '',
  start_date: '',
  end_date: '',
  is_current: false,
  gpa: '',
  description: '',
}

// Map item to form data for editing
const itemToFormData = (item: Education): EducationCreate => ({
  school_name: item.school_name,
  major: item.major || '',
  degree: item.degree || '',
  start_date: item.start_date || '',
  end_date: item.end_date || '',
  is_current: item.is_current,
  gpa: item.gpa || '',
  description: item.description || '',
})

// Clean form data before submit (convert empty strings to undefined)
const cleanFormData = (data: EducationCreate): EducationCreate => ({
  school_name: data.school_name,
  major: data.major || undefined,
  degree: data.degree || undefined,
  start_date: data.start_date || undefined,
  end_date: data.end_date || undefined,
  is_current: data.is_current,
  gpa: data.gpa || undefined,
  description: data.description || undefined,
})

export function TrainingsTab() {
  const { t } = useTranslation()
  const { user } = useUserStore()
  const queryClient = useQueryClient()

  // CRUD operations hook - uses educations API but with trainings i18n
  const crud = useCrudOperations<Education, EducationCreate>({
    queryKey: 'educations',
    api: educationsApi,
    i18nKey: 'trainings',
    initialFormData: INITIAL_FORM_DATA,
    itemToFormData,
    cleanFormData,
  })

  // Filter only training items (certificate, bootcamp, course, workshop, other)
  const filteredItems = useMemo(() => 
    crud.items.filter((item) => trainingDegreeValues.includes(item.degree || '')),
    [crud.items]
  )

  // Sortable list hook - uses filtered items
  const sort = useSortableList({
    items: filteredItems,
    queryKey: 'educations',
    reorderApi: educationsApi.reorder,
    dateConfig: { dateField: 'start_date' },
    getItemName: (item) => item.school_name,
  })

  // Custom reorder mutation for filtered list
  const reorderMutation = useMutation({
    mutationFn: (itemIds: number[]) => educationsApi.reorder(user!.id, itemIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['educations'] })
    },
  })

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const newItems = [...sort.sortedItems]
    const temp = newItems[index]
    newItems[index] = newItems[index - 1]
    newItems[index - 1] = temp
    reorderMutation.mutate(newItems.map(item => item.id))
  }

  const handleMoveDown = (index: number) => {
    if (index === sort.sortedItems.length - 1) return
    const newItems = [...sort.sortedItems]
    const temp = newItems[index]
    newItems[index] = newItems[index + 1]
    newItems[index + 1] = temp
    reorderMutation.mutate(newItems.map(item => item.id))
  }

  const getDegreeLabel = (degree: string | null) => {
    if (!degree) return null
    const option = TRAINING_DEGREE_OPTIONS.find((o) => o.value === degree)
    return option ? t(option.label) : degree
  }

  return (
    <div className="space-y-4">
      {/* Header with sort and add button */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <Select value={sort.sortBy} onValueChange={(v) => sort.setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dateDesc">{t(SORT_OPTIONS.dateDesc)}</SelectItem>
              <SelectItem value="dateAsc">{t(SORT_OPTIONS.dateAsc)}</SelectItem>
              <SelectItem value="nameAsc">{t(SORT_OPTIONS.nameAsc)}</SelectItem>
              <SelectItem value="nameDesc">{t(SORT_OPTIONS.nameDesc)}</SelectItem>
              <SelectItem value="manual">{t(SORT_OPTIONS.manual)}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={crud.handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          {t('credentials:trainings.add')}
        </Button>
      </div>

      {/* Content */}
      {crud.isLoading ? (
        <div className="text-center py-8">{t('common:loading')}</div>
      ) : sort.sortedItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('credentials:trainings.empty')}</h3>
            <p className="text-muted-foreground mb-4">{t('credentials:trainings.emptyDesc')}</p>
            <Button onClick={crud.handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              {t('credentials:trainings.addFirst')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sort.sortedItems.map((item, index) => (
            <Card key={item.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <BookOpen className="h-5 w-5 text-green-500" />
                      <h3 className="text-xl font-semibold">{item.school_name}</h3>
                      {item.is_current && (
                        <Badge variant="success">{t('credentials:trainings.current')}</Badge>
                      )}
                    </div>
                    {(item.degree || item.major) && (
                      <p className="font-medium">
                        {getDegreeLabel(item.degree)}
                        {item.degree && item.major && ' - '}
                        {item.major}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatDate(item.start_date)} ~{' '}
                      {item.end_date ? formatDate(item.end_date) : t('credentials:trainings.current')}
                    </p>
                    {item.description && (
                      <p className="text-muted-foreground mt-3">{item.description}</p>
                    )}
                    {item.attachment_path && (
                      <div className="mt-2">
                        <AttachmentUpload
                          userId={user!.id}
                          credentialType="educations"
                          credentialId={item.id}
                          attachmentPath={item.attachment_path}
                          attachmentName={item.attachment_name}
                          attachmentSize={item.attachment_size}
                          mode="compact"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {sort.sortBy === 'manual' && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0 || reorderMutation.isPending}
                          title={t('credentials:sort.moveUp')}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleMoveDown(index)}
                          disabled={index === sort.sortedItems.length - 1 || reorderMutation.isPending}
                          title={t('credentials:sort.moveDown')}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => crud.handleEdit(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => crud.handleDelete(item.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={crud.isDialogOpen} onOpenChange={crud.setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {crud.editingItem ? t('credentials:trainings.edit') : t('credentials:trainings.new')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={crud.handleSubmit} className="space-y-4">
            {/* Training type selection */}
            <div className="space-y-2">
              <Label htmlFor="degree">{t('credentials:trainings.type')} *</Label>
              <Select
                value={crud.formData.degree || ''}
                onValueChange={(value) => crud.setFormData(prev => ({ ...prev, degree: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('credentials:trainings.selectType')} />
                </SelectTrigger>
                <SelectContent>
                  {TRAINING_DEGREE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="school_name">{t('credentials:trainings.institutionName')} *</Label>
                <Input
                  id="school_name"
                  value={crud.formData.school_name}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, school_name: e.target.value }))}
                  placeholder={t('credentials:trainings.institutionNamePlaceholder')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="major">{t('credentials:trainings.courseName')}</Label>
                <Input
                  id="major"
                  value={crud.formData.major}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, major: e.target.value }))}
                  placeholder={t('credentials:trainings.courseNamePlaceholder')}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">{t('credentials:trainings.startDate')}</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={crud.formData.start_date || ''}
                  max={crud.formData.end_date || undefined}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">{t('credentials:trainings.endDate')}</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={crud.formData.end_date || ''}
                  min={crud.formData.start_date || undefined}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                  disabled={crud.formData.is_current}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_current"
                checked={crud.formData.is_current}
                onChange={(e) =>
                  crud.setFormData(prev => ({ ...prev, is_current: e.target.checked, end_date: '' }))
                }
              />
              <Label htmlFor="is_current">{t('credentials:trainings.currentlyEnrolled')}</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('credentials:trainings.description')}</Label>
              <Textarea
                id="description"
                value={crud.formData.description}
                onChange={(e) => crud.setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                placeholder={t('credentials:trainings.descriptionPlaceholder')}
              />
            </div>

            {crud.editingItem && (
              <div className="space-y-2">
                <Label>{t('credentials:attachment.title')}</Label>
                <AttachmentUpload
                  userId={user!.id}
                  credentialType="educations"
                  credentialId={crud.editingItem.id}
                  attachmentPath={crud.editingItem.attachment_path}
                  attachmentName={crud.editingItem.attachment_name}
                  attachmentSize={crud.editingItem.attachment_size}
                  mode="full"
                />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => crud.setIsDialogOpen(false)}>
                {t('common:cancel')}
              </Button>
              <Button
                type="submit"
                disabled={crud.isCreating || crud.isUpdating || !crud.formData.degree}
              >
                {crud.editingItem ? t('common:edit') : t('common:add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
