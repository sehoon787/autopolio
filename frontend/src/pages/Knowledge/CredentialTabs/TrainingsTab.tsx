import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { educationsApi, Education, EducationCreate } from '@/api/credentials'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, BookOpen, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import { AttachmentUpload } from '@/components/AttachmentUpload'

// Training/Course degree options (non-formal education)
const TRAINING_DEGREE_OPTIONS = [
  { value: 'certificate', label: 'credentials:trainings.degrees.certificate' },
  { value: 'bootcamp', label: 'credentials:trainings.degrees.bootcamp' },
  { value: 'course', label: 'credentials:trainings.degrees.course' },
  { value: 'workshop', label: 'credentials:trainings.degrees.workshop' },
  { value: 'other', label: 'credentials:trainings.degrees.other' },
]

interface FormData extends EducationCreate {
  school_name: string
  major: string
  degree: string
  start_date: string
  end_date: string
  is_current: boolean
  gpa: string
  description: string
}

type SortOption = 'dateDesc' | 'dateAsc' | 'nameAsc' | 'nameDesc' | 'manual'

export function TrainingsTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Education | null>(null)
  const [sortBy, setSortBy] = useState<SortOption>('dateDesc')
  const [formData, setFormData] = useState<FormData>({
    school_name: '',
    major: '',
    degree: '',
    start_date: '',
    end_date: '',
    is_current: false,
    gpa: '',
    description: '',
  })

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ['educations', user?.id],
    queryFn: () => educationsApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  // Filter only training items (certificate, bootcamp, course, workshop, other)
  const trainingDegreeValues = TRAINING_DEGREE_OPTIONS.map((opt) => opt.value)
  const filteredItems = (itemsData?.data || []).filter((item) =>
    trainingDegreeValues.includes(item.degree || '')
  )

  // Sort items based on selected option
  const items = [...filteredItems].sort((a, b) => {
    switch (sortBy) {
      case 'dateDesc':
        return (b.start_date || '').localeCompare(a.start_date || '')
      case 'dateAsc':
        return (a.start_date || '').localeCompare(b.start_date || '')
      case 'nameAsc':
        return a.school_name.localeCompare(b.school_name)
      case 'nameDesc':
        return b.school_name.localeCompare(a.school_name)
      case 'manual':
      default:
        return a.display_order - b.display_order
    }
  })

  const reorderMutation = useMutation({
    mutationFn: (itemIds: number[]) => educationsApi.reorder(user!.id, itemIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['educations'] })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const newItems = [...items]
    const temp = newItems[index]
    newItems[index] = newItems[index - 1]
    newItems[index - 1] = temp
    reorderMutation.mutate(newItems.map(item => item.id))
  }

  const handleMoveDown = (index: number) => {
    if (index === items.length - 1) return
    const newItems = [...items]
    const temp = newItems[index]
    newItems[index] = newItems[index + 1]
    newItems[index + 1] = temp
    reorderMutation.mutate(newItems.map(item => item.id))
  }

  const createMutation = useMutation({
    mutationFn: (data: EducationCreate) => educationsApi.create(user!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['educations'] })
      setIsDialogOpen(false)
      resetForm()
      toast({ title: t('credentials:trainings.added') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<EducationCreate> }) =>
      educationsApi.update(user!.id, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['educations'] })
      setIsDialogOpen(false)
      setEditingItem(null)
      resetForm()
      toast({ title: t('credentials:trainings.updated') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => educationsApi.delete(user!.id, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['educations'] })
      toast({ title: t('credentials:trainings.deleted') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const resetForm = () => {
    setFormData({
      school_name: '',
      major: '',
      degree: '',
      start_date: '',
      end_date: '',
      is_current: false,
      gpa: '',
      description: '',
    })
  }

  const handleEdit = (item: Education) => {
    setEditingItem(item)
    setFormData({
      school_name: item.school_name,
      major: item.major || '',
      degree: item.degree || '',
      start_date: item.start_date || '',
      end_date: item.end_date || '',
      is_current: item.is_current,
      gpa: item.gpa || '',
      description: item.description || '',
    })
    setIsDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const cleanedData: EducationCreate = {
      school_name: formData.school_name,
      major: formData.major || undefined,
      degree: formData.degree || undefined,
      start_date: formData.start_date || undefined,
      end_date: formData.end_date || undefined,
      is_current: formData.is_current,
      gpa: formData.gpa || undefined,
      description: formData.description || undefined,
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: cleanedData })
    } else {
      createMutation.mutate(cleanedData)
    }
  }

  const getDegreeLabel = (degree: string | null) => {
    if (!degree) return null
    const option = TRAINING_DEGREE_OPTIONS.find((o) => o.value === degree)
    return option ? t(option.label) : degree
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dateDesc">{t('credentials:sort.dateDesc')}</SelectItem>
              <SelectItem value="dateAsc">{t('credentials:sort.dateAsc')}</SelectItem>
              <SelectItem value="nameAsc">{t('credentials:sort.nameAsc')}</SelectItem>
              <SelectItem value="nameDesc">{t('credentials:sort.nameDesc')}</SelectItem>
              <SelectItem value="manual">{t('credentials:sort.manual')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => {
            resetForm()
            setEditingItem(null)
            setIsDialogOpen(true)
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          {t('credentials:trainings.add')}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">{t('common:loading')}</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('credentials:trainings.empty')}</h3>
            <p className="text-muted-foreground mb-4">{t('credentials:trainings.emptyDesc')}</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('credentials:trainings.addFirst')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((item, index) => (
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
                    {sortBy === 'manual' && (
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
                          disabled={index === items.length - 1 || reorderMutation.isPending}
                          title={t('credentials:sort.moveDown')}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(t('credentials:confirmDelete'))) {
                          deleteMutation.mutate(item.id)
                        }
                      }}
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? t('credentials:trainings.edit') : t('credentials:trainings.new')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Training type selection */}
            <div className="space-y-2">
              <Label htmlFor="degree">{t('credentials:trainings.type')} *</Label>
              <Select
                value={formData.degree || ''}
                onValueChange={(value) => setFormData({ ...formData, degree: value })}
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
                  value={formData.school_name}
                  onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
                  placeholder={t('credentials:trainings.institutionNamePlaceholder')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="major">{t('credentials:trainings.courseName')}</Label>
                <Input
                  id="major"
                  value={formData.major}
                  onChange={(e) => setFormData({ ...formData, major: e.target.value })}
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
                  value={formData.start_date || ''}
                  max={formData.end_date || undefined}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">{t('credentials:trainings.endDate')}</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date || ''}
                  min={formData.start_date || undefined}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  disabled={formData.is_current}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_current"
                checked={formData.is_current}
                onChange={(e) =>
                  setFormData({ ...formData, is_current: e.target.checked, end_date: '' })
                }
              />
              <Label htmlFor="is_current">{t('credentials:trainings.currentlyEnrolled')}</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('credentials:trainings.description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder={t('credentials:trainings.descriptionPlaceholder')}
              />
            </div>

            {editingItem && (
              <div className="space-y-2">
                <Label>{t('credentials:attachment.title')}</Label>
                <AttachmentUpload
                  userId={user!.id}
                  credentialType="educations"
                  credentialId={editingItem.id}
                  attachmentPath={editingItem.attachment_path}
                  attachmentName={editingItem.attachment_name}
                  attachmentSize={editingItem.attachment_size}
                  mode="full"
                />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                {t('common:cancel')}
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending || !formData.degree}
              >
                {editingItem ? t('common:edit') : t('common:add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
