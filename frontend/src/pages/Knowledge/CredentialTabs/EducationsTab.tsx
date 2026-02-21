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
import { Plus, Pencil, Trash2, GraduationCap } from 'lucide-react'
import { AttachmentUpload } from '@/components/AttachmentUpload'
import { UniversityAutocomplete, MajorAutocomplete } from '@/components/Autocomplete'
import { useCrudOperations } from '@/hooks/useCrudOperations'

const DEGREE_OPTIONS = [
  { value: 'high_school', label: 'credentials:educations.degrees.highSchool' },
  { value: 'associate', label: 'credentials:educations.degrees.associate' },
  { value: 'bachelor', label: 'credentials:educations.degrees.bachelor' },
  { value: 'master', label: 'credentials:educations.degrees.master' },
  { value: 'doctorate', label: 'credentials:educations.degrees.doctorate' },
  { value: 'certificate', label: 'credentials:educations.degrees.certificate' },
  { value: 'bootcamp', label: 'credentials:educations.degrees.bootcamp' },
  { value: 'other', label: 'credentials:educations.degrees.other' },
]

// Initial form data for educations
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

export function EducationsTab() {
  const { t } = useTranslation()
  const { user } = useUserStore()

  // CRUD operations hook
  const crud = useCrudOperations<Education, EducationCreate>({
    queryKey: 'educations',
    api: educationsApi,
    i18nKey: 'educations',
    initialFormData: INITIAL_FORM_DATA,
    itemToFormData,
    cleanFormData,
  })

  if (!user) return null

  const getDegreeLabel = (degree: string | null) => {
    if (!degree) return null
    const option = DEGREE_OPTIONS.find(o => o.value === degree)
    return option ? t(option.label) : degree
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={crud.handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          {t('credentials:educations.add')}
        </Button>
      </div>

      {crud.isLoading ? (
        <div className="text-center py-8">{t('common:loading')}</div>
      ) : crud.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GraduationCap className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('credentials:educations.empty')}</h3>
            <p className="text-muted-foreground mb-4">{t('credentials:educations.emptyDesc')}</p>
            <Button onClick={crud.handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              {t('credentials:educations.addFirst')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {crud.items.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <GraduationCap className="h-5 w-5 text-blue-500" />
                      <h3 className="text-xl font-semibold">{item.school_name}</h3>
                      {item.is_current && <Badge variant="success">{t('credentials:educations.current')}</Badge>}
                    </div>
                    {(item.degree || item.major) && (
                      <p className="font-medium">
                        {getDegreeLabel(item.degree)}
                        {item.degree && item.major && ' - '}
                        {item.major}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatDate(item.start_date)} ~ {item.end_date ? formatDate(item.end_date) : t('credentials:educations.current')}
                    </p>
                    {item.gpa && (
                      <p className="text-sm text-muted-foreground">
                        {t('credentials:educations.gpa')}: {item.gpa}
                      </p>
                    )}
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
                  <div className="flex gap-2">
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

      <Dialog open={crud.isDialogOpen} onOpenChange={crud.setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {crud.editingItem ? t('credentials:educations.edit') : t('credentials:educations.new')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={crud.handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="school_name">{t('credentials:educations.schoolName')} *</Label>
                <UniversityAutocomplete
                  value={crud.formData.school_name}
                  onChange={(name) => crud.setFormData(prev => ({ ...prev, school_name: name }))}
                  placeholder={t('credentials:educations.schoolName')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="major">{t('credentials:educations.major')}</Label>
                <MajorAutocomplete
                  value={crud.formData.major || ''}
                  onChange={(name) => crud.setFormData(prev => ({ ...prev, major: name }))}
                  placeholder={t('credentials:educations.major')}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="degree">{t('credentials:educations.degree')}</Label>
                <Select
                  value={crud.formData.degree || ''}
                  onValueChange={(value) => crud.setFormData(prev => ({ ...prev, degree: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('credentials:educations.selectDegree')} />
                  </SelectTrigger>
                  <SelectContent>
                    {DEGREE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gpa">{t('credentials:educations.gpa')}</Label>
                <Input
                  id="gpa"
                  value={crud.formData.gpa}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, gpa: e.target.value }))}
                  placeholder="3.5/4.0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">{t('credentials:educations.startDate')}</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={crud.formData.start_date || ''}
                  max={crud.formData.end_date || undefined}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">{t('credentials:educations.endDate')}</Label>
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
                onChange={(e) => crud.setFormData(prev => ({ ...prev, is_current: e.target.checked, end_date: '' }))}
              />
              <Label htmlFor="is_current">{t('credentials:educations.currentlyEnrolled')}</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('credentials:educations.description')}</Label>
              <Textarea
                id="description"
                value={crud.formData.description}
                onChange={(e) => crud.setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                placeholder={t('credentials:educations.descriptionPlaceholder')}
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
              <Button type="submit" disabled={crud.isCreating || crud.isUpdating}>
                {crud.editingItem ? t('common:edit') : t('common:add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
