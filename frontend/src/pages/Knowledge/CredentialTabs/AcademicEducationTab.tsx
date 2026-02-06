import { useState, useMemo, useCallback } from 'react'
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
import { UniversityResult } from '@/api/lookup'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, GraduationCap, Globe, ExternalLink, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import { AttachmentUpload } from '@/components/AttachmentUpload'
import { UniversityAutocomplete, UniversityInfoDisplay, MajorAutocomplete } from '@/components/Autocomplete'
import { useSortableList, SortOption, SORT_OPTIONS } from '@/hooks/useSortableList'

// Academic degree options (formal education)
const ACADEMIC_DEGREE_OPTIONS = [
  { value: 'high_school', label: 'credentials:academicEducation.degrees.highSchool' },
  { value: 'associate', label: 'credentials:academicEducation.degrees.associate' },
  { value: 'bachelor', label: 'credentials:academicEducation.degrees.bachelor' },
  { value: 'master', label: 'credentials:academicEducation.degrees.master' },
  { value: 'doctorate', label: 'credentials:academicEducation.degrees.doctorate' },
]

// Graduation status options
const GRADUATION_STATUS_OPTIONS = [
  { value: 'graduated', label: 'credentials:academicEducation.graduationStatus.graduated' },
  { value: 'enrolled', label: 'credentials:academicEducation.graduationStatus.enrolled' },
  { value: 'completed', label: 'credentials:academicEducation.graduationStatus.completed' },
  { value: 'withdrawn', label: 'credentials:academicEducation.graduationStatus.withdrawn' },
]

// Degree types that should show university autocomplete
const UNIVERSITY_DEGREE_TYPES = ['associate', 'bachelor', 'master', 'doctorate']

interface FormData extends EducationCreate {
  school_name: string
  major: string
  degree: string
  start_date: string
  end_date: string
  graduation_status: string
  gpa: string
  description: string
  school_country?: string
  school_country_code?: string
  school_state?: string
  school_domain?: string
  school_web_page?: string
}

const INITIAL_FORM_DATA: FormData = {
  school_name: '',
  major: '',
  degree: '',
  start_date: '',
  end_date: '',
  graduation_status: '',
  gpa: '',
  description: '',
  school_country: '',
  school_country_code: '',
  school_state: '',
  school_domain: '',
  school_web_page: '',
}

export function AcademicEducationTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Education | null>(null)
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA)

  // Query
  const { data: itemsData, isLoading } = useQuery({
    queryKey: ['educations', user?.id],
    queryFn: () => educationsApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  // Filter only academic education items
  const items = useMemo(() => 
    (itemsData?.data || []).filter(
      (item) => ACADEMIC_DEGREE_OPTIONS.some((opt) => opt.value === item.degree) || !item.degree
    ),
    [itemsData?.data]
  )

  // Sortable list hook
  const sort = useSortableList({
    items,
    queryKey: 'educations',
    reorderApi: educationsApi.reorder,
    dateConfig: { dateField: 'start_date' },
    getItemName: (item) => item.school_name || '',
  })

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: EducationCreate) => educationsApi.create(user!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['educations'] })
      setIsDialogOpen(false)
      resetForm()
      toast({ title: t('credentials:academicEducation.added') })
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
      toast({ title: t('credentials:academicEducation.updated') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => educationsApi.delete(user!.id, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['educations'] })
      toast({ title: t('credentials:academicEducation.deleted') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  // Actions
  const resetForm = useCallback(() => {
    setFormData(INITIAL_FORM_DATA)
  }, [])

  const handleCreate = useCallback(() => {
    resetForm()
    setEditingItem(null)
    setIsDialogOpen(true)
  }, [resetForm])

  const handleEdit = useCallback((item: Education) => {
    setEditingItem(item)
    setFormData({
      school_name: item.school_name,
      major: item.major || '',
      degree: item.degree || '',
      start_date: item.start_date || '',
      end_date: item.end_date || '',
      graduation_status: item.graduation_status || (item.is_current ? 'enrolled' : ''),
      gpa: item.gpa || '',
      description: item.description || '',
      school_country: item.school_country || '',
      school_country_code: item.school_country_code || '',
      school_state: item.school_state || '',
      school_domain: item.school_domain || '',
      school_web_page: item.school_web_page || '',
    })
    setIsDialogOpen(true)
  }, [])

  const handleUniversitySelect = useCallback((university: UniversityResult) => {
    setFormData((prev) => ({
      ...prev,
      school_name: university.name,
      school_country: university.country,
      school_country_code: university.country_code,
      school_state: university.state || '',
      school_domain: university.domain || '',
      school_web_page: university.web_page || '',
    }))
  }, [])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const isEnrolled = formData.graduation_status === 'enrolled'
    const cleanedData: EducationCreate = {
      school_name: formData.school_name,
      major: formData.major || undefined,
      degree: formData.degree || undefined,
      start_date: formData.start_date || undefined,
      end_date: isEnrolled ? undefined : formData.end_date || undefined,
      is_current: isEnrolled,
      graduation_status: formData.graduation_status || undefined,
      gpa: formData.gpa || undefined,
      description: formData.description || undefined,
      school_country: formData.school_country || undefined,
      school_country_code: formData.school_country_code || undefined,
      school_state: formData.school_state || undefined,
      school_domain: formData.school_domain || undefined,
      school_web_page: formData.school_web_page || undefined,
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: cleanedData })
    } else {
      createMutation.mutate(cleanedData)
    }
  }, [formData, editingItem, createMutation, updateMutation])

  const handleDelete = useCallback((id: number) => {
    if (confirm(t('credentials:confirmDelete'))) {
      deleteMutation.mutate(id)
    }
  }, [deleteMutation, t])

  const getDegreeLabel = (degree: string | null) => {
    if (!degree) return null
    const option = ACADEMIC_DEGREE_OPTIONS.find((o) => o.value === degree)
    return option ? t(option.label) : degree
  }

  const getGraduationStatusLabel = (status: string | null) => {
    if (!status) return null
    const option = GRADUATION_STATUS_OPTIONS.find((o) => o.value === status)
    return option ? t(option.label) : status
  }

  const getGraduationStatusBadgeVariant = (status: string | null) => {
    switch (status) {
      case 'graduated': return 'default'
      case 'enrolled': return 'success'
      case 'completed': return 'secondary'
      case 'withdrawn': return 'outline'
      default: return 'secondary'
    }
  }

  const showUniversityAutocomplete = UNIVERSITY_DEGREE_TYPES.includes(formData.degree)
  const isEnrolled = formData.graduation_status === 'enrolled'

  const getCountryFlag = (code: string | null) => {
    if (!code || code.length !== 2) return '🌍'
    const codePoints = [...code.toUpperCase()].map((char) => 127397 + char.charCodeAt(0))
    try {
      return String.fromCodePoint(...codePoints)
    } catch {
      return '🌍'
    }
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
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          {t('credentials:academicEducation.add')}
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-8">{t('common:loading')}</div>
      ) : sort.sortedItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GraduationCap className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('credentials:academicEducation.empty')}</h3>
            <p className="text-muted-foreground mb-4">{t('credentials:academicEducation.emptyDesc')}</p>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              {t('credentials:academicEducation.addFirst')}
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
                      <GraduationCap className="h-5 w-5 text-blue-500" />
                      <h3 className="text-xl font-semibold">{item.school_name}</h3>
                      {(item.graduation_status || item.is_current) && (
                        <Badge variant={getGraduationStatusBadgeVariant(item.graduation_status)}>
                          {getGraduationStatusLabel(item.graduation_status) ||
                            (item.is_current ? t('credentials:academicEducation.graduationStatus.enrolled') : null)}
                        </Badge>
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
                      {item.graduation_status === 'enrolled' || item.is_current
                        ? t('credentials:academicEducation.present')
                        : formatDate(item.end_date) || ''}
                    </p>
                    {item.gpa && (
                      <p className="text-sm text-muted-foreground">
                        {t('credentials:academicEducation.gpa')}: {item.gpa}
                      </p>
                    )}
                    {/* University metadata (read-only) */}
                    {(item.school_country || item.school_domain || item.school_web_page) && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                        {item.school_country && (
                          <span className="flex items-center gap-1.5">
                            <span>{getCountryFlag(item.school_country_code)}</span>
                            <span>
                              {item.school_state && `${item.school_state}, `}
                              {item.school_country}
                            </span>
                          </span>
                        )}
                        {item.school_domain && (
                          <span className="flex items-center gap-1.5">
                            <Globe className="h-3.5 w-3.5" />
                            <span>{item.school_domain}</span>
                          </span>
                        )}
                        {item.school_web_page && (
                          <a
                            href={item.school_web_page}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>Website</span>
                          </a>
                        )}
                      </div>
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
                  <div className="flex gap-1">
                    {sort.sortBy === 'manual' && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => sort.handleMoveUp(index)}
                          disabled={index === 0 || sort.isReordering}
                          title={t('credentials:sort.moveUp')}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => sort.handleMoveDown(index)}
                          disabled={index === sort.sortedItems.length - 1 || sort.isReordering}
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
                      onClick={() => handleDelete(item.id)}
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
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingItem
                ? t('credentials:academicEducation.edit')
                : t('credentials:academicEducation.new')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                    onSelect={handleUniversitySelect}
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
                disabled={createMutation.isPending || updateMutation.isPending || !formData.degree || !formData.graduation_status}
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
