import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Education } from '@/api/credentials'
import { UniversityResult } from '@/api/lookup'
import { AttachmentUpload } from '@/components/AttachmentUpload'
import { UniversityAutocomplete, UniversityInfoDisplay, MajorAutocomplete } from '@/components/Autocomplete'
import {
  ACADEMIC_DEGREE_OPTIONS,
  GRADUATION_STATUS_OPTIONS,
  UNIVERSITY_DEGREE_TYPES,
  FormData,
} from '../academicEducationConstants'

interface AcademicEducationFormDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  editingItem: Education | null
  formData: FormData
  setFormData: React.Dispatch<React.SetStateAction<FormData>>
  onSubmit: (e: React.FormEvent) => void
  onUniversitySelect: (university: UniversityResult) => void
  createIsPending: boolean
  updateIsPending: boolean
  userId: number
}

export function AcademicEducationFormDialog({
  isOpen,
  onOpenChange,
  editingItem,
  formData,
  setFormData,
  onSubmit,
  onUniversitySelect,
  createIsPending,
  updateIsPending,
  userId,
}: AcademicEducationFormDialogProps) {
  const { t } = useTranslation()

  const showUniversityAutocomplete = UNIVERSITY_DEGREE_TYPES.includes(formData.degree)
  const isEnrolled = formData.graduation_status === 'enrolled'

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editingItem
              ? t('credentials:academicEducation.edit')
              : t('credentials:academicEducation.new')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Degree selection first */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="degree">{t('credentials:academicEducation.degree')} *</Label>
              <Select
                value={formData.degree || ''}
                onValueChange={(value) =>
                  setFormData(prev => ({
                    ...prev,
                    degree: value,
                    // Clear university metadata when changing degree type
                    school_country: '',
                    school_country_code: '',
                    school_state: '',
                    school_domain: '',
                    school_web_page: '',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('credentials:academicEducation.selectDegree')} />
                </SelectTrigger>
                <SelectContent>
                  {ACADEMIC_DEGREE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="graduation_status">{t('credentials:academicEducation.graduationStatusLabel')} *</Label>
              <Select
                value={formData.graduation_status || ''}
                onValueChange={(value) =>
                  setFormData(prev => ({
                    ...prev,
                    graduation_status: value,
                    // Clear end_date if enrolled
                    end_date: value === 'enrolled' ? '' : prev.end_date,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('credentials:academicEducation.selectGraduationStatus')} />
                </SelectTrigger>
                <SelectContent>
                  {GRADUATION_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="school_name">{t('credentials:academicEducation.schoolName')} *</Label>
              {showUniversityAutocomplete ? (
                <UniversityAutocomplete
                  value={formData.school_name}
                  onChange={(name) => setFormData(prev => ({ ...prev, school_name: name }))}
                  onSelect={onUniversitySelect}
                  placeholder={t('credentials:academicEducation.schoolNamePlaceholder')}
                />
              ) : (
                <Input
                  id="school_name"
                  value={formData.school_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, school_name: e.target.value }))}
                  placeholder={t('credentials:academicEducation.schoolName')}
                  required
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="major">{t('credentials:academicEducation.major')}</Label>
              {showUniversityAutocomplete ? (
                <MajorAutocomplete
                  value={formData.major || ''}
                  onChange={(name) => setFormData(prev => ({ ...prev, major: name }))}
                  placeholder={t('credentials:academicEducation.major')}
                />
              ) : (
                <Input
                  id="major"
                  value={formData.major}
                  onChange={(e) => setFormData(prev => ({ ...prev, major: e.target.value }))}
                  placeholder={t('credentials:academicEducation.major')}
                />
              )}
            </div>
          </div>

          {/* University metadata display (read-only) */}
          {showUniversityAutocomplete && formData.school_country && (
            <UniversityInfoDisplay
              country={formData.school_country}
              countryCode={formData.school_country_code}
              state={formData.school_state}
              domain={formData.school_domain}
              webPage={formData.school_web_page}
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gpa">{t('credentials:academicEducation.gpa')}</Label>
              <Input
                id="gpa"
                value={formData.gpa}
                onChange={(e) => setFormData(prev => ({ ...prev, gpa: e.target.value }))}
                placeholder="3.5/4.0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">{t('credentials:academicEducation.startDate')}</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date || ''}
                max={formData.end_date || undefined}
                onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">{t('credentials:academicEducation.endDate')}</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date || ''}
                min={formData.start_date || undefined}
                onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                disabled={isEnrolled}
              />
              {isEnrolled && (
                <p className="text-xs text-muted-foreground">
                  {t('credentials:academicEducation.enrolledNoEndDate')}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('credentials:academicEducation.description')}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              placeholder={t('credentials:academicEducation.descriptionPlaceholder')}
            />
          </div>

          {editingItem && (
            <div className="space-y-2">
              <Label>{t('credentials:attachment.title')}</Label>
              <AttachmentUpload
                userId={userId}
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:cancel')}
            </Button>
            <Button
              type="submit"
              disabled={createIsPending || updateIsPending || !formData.degree || !formData.graduation_status}
            >
              {editingItem ? t('common:edit') : t('common:add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
