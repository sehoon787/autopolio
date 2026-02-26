import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { educationsApi, Education, EducationCreate } from '@/api/credentials'
import { UniversityResult } from '@/api/lookup'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, GraduationCap, Globe, ExternalLink, ChevronUp, ChevronDown } from 'lucide-react'
import { AttachmentUpload } from '@/components/AttachmentUpload'
import { useSortableList, SortOption } from '@/hooks/useSortableList'
import {
  ACADEMIC_DEGREE_OPTIONS,
  GRADUATION_STATUS_OPTIONS,
  FormData,
  INITIAL_FORM_DATA,
} from './academicEducationConstants'
import { AcademicEducationFormDialog } from './components/AcademicEducationFormDialog'

interface AcademicEducationTabProps {
  createTrigger?: number
  sortBy?: SortOption
}

export function AcademicEducationTab({ createTrigger, sortBy: externalSortBy }: AcademicEducationTabProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()
  const [animateRef] = useAutoAnimate({ duration: 200 })
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

  // Sync external sort
  useEffect(() => {
    if (externalSortBy) sort.setSortBy(externalSortBy)
  }, [externalSortBy])

  // Trigger create from parent
  useEffect(() => {
    if (createTrigger && createTrigger > 0) handleCreate()
  }, [createTrigger])

  if (!user) return null

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
        <div ref={animateRef} className="grid gap-4">
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
      <AcademicEducationFormDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        editingItem={editingItem}
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleSubmit}
        onUniversitySelect={handleUniversitySelect}
        createIsPending={createMutation.isPending}
        updateIsPending={updateMutation.isPending}
        userId={user!.id}
      />
    </div>
  )
}
