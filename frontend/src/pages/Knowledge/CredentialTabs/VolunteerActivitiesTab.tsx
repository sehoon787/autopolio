import { useEffect, useMemo, useCallback } from 'react'
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
import { volunteerActivitiesApi, VolunteerActivity, VolunteerActivityCreate } from '@/api/credentials'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, Heart, ExternalLink, Users, ChevronUp, ChevronDown } from 'lucide-react'
import { AttachmentUpload } from '@/components/AttachmentUpload'
import { useCrudOperations } from '@/hooks/useCrudOperations'
import { useSortableList, SortOption } from '@/hooks/useSortableList'

const ACTIVITY_TYPES = [
  { value: 'volunteer', label: 'credentials:volunteerActivities.types.volunteer' },
  { value: 'external', label: 'credentials:volunteerActivities.types.external' },
]

interface VolunteerActivitiesTabProps {
  activityType?: 'volunteer' | 'external'
  createTrigger?: number
  sortBy?: SortOption
}

// Initial form data for volunteer activities
const createInitialFormData = (activityType?: string): VolunteerActivityCreate => ({
  name: '',
  organization: '',
  activity_type: activityType || '',
  start_date: '',
  end_date: '',
  is_current: false,
  hours: undefined,
  role: '',
  description: '',
  certificate_url: '',
})

// Map item to form data for editing
const itemToFormData = (item: VolunteerActivity): VolunteerActivityCreate => ({
  name: item.name,
  organization: item.organization || '',
  activity_type: item.activity_type || '',
  start_date: item.start_date || '',
  end_date: item.end_date || '',
  is_current: item.is_current,
  hours: item.hours || undefined,
  role: item.role || '',
  description: item.description || '',
  certificate_url: item.certificate_url || '',
})

// Clean form data before submit
const cleanFormData = (data: VolunteerActivityCreate): VolunteerActivityCreate => ({
  name: data.name,
  organization: data.organization || undefined,
  activity_type: data.activity_type || undefined,
  start_date: data.start_date || undefined,
  end_date: data.end_date || undefined,
  is_current: data.is_current,
  hours: data.hours || undefined,
  role: data.role || undefined,
  description: data.description || undefined,
  certificate_url: data.certificate_url || undefined,
})

export function VolunteerActivitiesTab({ activityType, createTrigger, sortBy: externalSortBy }: VolunteerActivitiesTabProps) {
  const { t } = useTranslation()
  const { user } = useUserStore()

  // CRUD operations hook
  const crud = useCrudOperations<VolunteerActivity, VolunteerActivityCreate>({
    queryKey: 'volunteer_activities',
    api: volunteerActivitiesApi,
    i18nKey: 'volunteerActivities',
    initialFormData: createInitialFormData(activityType),
    itemToFormData,
    cleanFormData,
  })

  // Filter items by activityType if provided
  const filteredItems = useMemo(() => {
    return activityType
      ? crud.items.filter(item => item.activity_type === activityType)
      : crud.items
  }, [crud.items, activityType])

  // Sortable list hook
  const sort = useSortableList({
    items: filteredItems,
    queryKey: 'volunteer_activities',
    reorderApi: volunteerActivitiesApi.reorder,
    dateConfig: { dateField: 'start_date' },
  })

  // Custom create handler to reset with activityType
  const handleCreate = useCallback(() => {
    crud.resetForm()
    crud.setFormData(createInitialFormData(activityType))
    crud.setIsDialogOpen(true)
  }, [activityType, crud])

  // Sync external sort
  useEffect(() => {
    if (externalSortBy) sort.setSortBy(externalSortBy)
  }, [externalSortBy])

  // Trigger create from parent
  useEffect(() => {
    if (createTrigger && createTrigger > 0) handleCreate()
  }, [createTrigger])

  if (!user) return null

  const getTypeLabel = (type: string | null) => {
    if (!type) return null
    const option = ACTIVITY_TYPES.find(o => o.value === type)
    return option ? t(option.label) : type
  }

  const getTypeBadgeVariant = (type: string | null) => {
    switch (type) {
      case 'volunteer': return 'default'
      case 'external': return 'secondary'
      default: return 'outline'
    }
  }

  return (
    <div className="space-y-4">
      {crud.isLoading ? (
        <div className="text-center py-8">{t('common:loading')}</div>
      ) : sort.sortedItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Heart className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('credentials:volunteerActivities.empty')}</h3>
            <p className="text-muted-foreground mb-4">{t('credentials:volunteerActivities.emptyDesc')}</p>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              {t('credentials:volunteerActivities.addFirst')}
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
                      {item.activity_type === 'volunteer' ? (
                        <Heart className="h-5 w-5 text-pink-500" />
                      ) : (
                        <Users className="h-5 w-5 text-purple-500" />
                      )}
                      <h3 className="text-xl font-semibold">{item.name}</h3>
                      {item.activity_type && (
                        <Badge variant={getTypeBadgeVariant(item.activity_type)}>
                          {getTypeLabel(item.activity_type)}
                        </Badge>
                      )}
                      {item.is_current && <Badge variant="success">{t('credentials:volunteerActivities.current')}</Badge>}
                    </div>
                    {item.organization && (
                      <p className="text-sm text-muted-foreground">
                        {t('credentials:volunteerActivities.organization')}: {item.organization}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {formatDate(item.start_date)} ~ {item.end_date ? formatDate(item.end_date) : t('credentials:volunteerActivities.current')}
                    </p>
                    {item.role && (
                      <p className="text-sm text-muted-foreground">
                        {t('credentials:volunteerActivities.role')}: {item.role}
                      </p>
                    )}
                    {item.hours && item.activity_type === 'volunteer' && (
                      <p className="text-sm text-muted-foreground">
                        {t('credentials:volunteerActivities.hours')}: {item.hours}{t('credentials:volunteerActivities.hoursUnit')}
                      </p>
                    )}
                    {item.certificate_url && (
                      <a
                        href={item.certificate_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-500 hover:underline inline-flex items-center gap-1 mt-1"
                      >
                        {t('credentials:volunteerActivities.viewCertificate')} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {item.description && (
                      <p className="text-muted-foreground mt-3">{item.description}</p>
                    )}
                    {item.attachment_path && (
                      <div className="mt-2">
                        <AttachmentUpload
                          userId={user!.id}
                          credentialType="volunteer_activities"
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
              {crud.editingItem ? t('credentials:volunteerActivities.edit') : t('credentials:volunteerActivities.new')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={crud.handleSubmit} className="space-y-4">
            <div className={activityType ? "" : "grid grid-cols-2 gap-4"}>
              <div className="space-y-2">
                <Label htmlFor="name">{t('credentials:volunteerActivities.name')} *</Label>
                <Input
                  id="name"
                  value={crud.formData.name}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              {!activityType && (
                <div className="space-y-2">
                  <Label htmlFor="activity_type">{t('credentials:volunteerActivities.type')}</Label>
                  <Select
                    value={crud.formData.activity_type || ''}
                    onValueChange={(value) => crud.setFormData(prev => ({ ...prev, activity_type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('credentials:volunteerActivities.selectType')} />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTIVITY_TYPES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {t(option.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="organization">{t('credentials:volunteerActivities.organization')}</Label>
                <Input
                  id="organization"
                  value={crud.formData.organization}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, organization: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">{t('credentials:volunteerActivities.role')}</Label>
                <Input
                  id="role"
                  value={crud.formData.role}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, role: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">{t('credentials:volunteerActivities.startDate')}</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={crud.formData.start_date || ''}
                  max={crud.formData.end_date || undefined}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">{t('credentials:volunteerActivities.endDate')}</Label>
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
              <Label htmlFor="is_current">{t('credentials:volunteerActivities.currentlyActive')}</Label>
            </div>
            {(activityType === 'volunteer' || crud.formData.activity_type === 'volunteer') && (
              <div className="space-y-2">
                <Label htmlFor="hours">{t('credentials:volunteerActivities.hours')}</Label>
                <Input
                  id="hours"
                  type="number"
                  min="0"
                  value={crud.formData.hours || ''}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, hours: e.target.value ? parseInt(e.target.value) : undefined }))}
                  placeholder="0"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="certificate_url">{t('credentials:volunteerActivities.certificateUrl')}</Label>
              <Input
                id="certificate_url"
                type="url"
                value={crud.formData.certificate_url}
                onChange={(e) => crud.setFormData(prev => ({ ...prev, certificate_url: e.target.value }))}
                placeholder="https://"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('credentials:volunteerActivities.description')}</Label>
              <Textarea
                id="description"
                value={crud.formData.description}
                onChange={(e) => crud.setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                placeholder={t('credentials:volunteerActivities.descriptionPlaceholder')}
              />
            </div>
            {crud.editingItem && (
              <div className="space-y-2">
                <Label>{t('credentials:attachment.title')}</Label>
                <AttachmentUpload
                  userId={user!.id}
                  credentialType="volunteer_activities"
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
