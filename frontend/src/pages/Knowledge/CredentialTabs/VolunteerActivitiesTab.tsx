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
import { volunteerActivitiesApi, VolunteerActivity, VolunteerActivityCreate } from '@/api/credentials'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, Heart, ExternalLink, Users, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import { AttachmentUpload } from '@/components/AttachmentUpload'

const ACTIVITY_TYPES = [
  { value: 'volunteer', label: 'credentials:volunteerActivities.types.volunteer' },
  { value: 'external', label: 'credentials:volunteerActivities.types.external' },
]

interface VolunteerActivitiesTabProps {
  activityType?: 'volunteer' | 'external'
}

type SortOption = 'dateDesc' | 'dateAsc' | 'nameAsc' | 'nameDesc' | 'manual'

export function VolunteerActivitiesTab({ activityType }: VolunteerActivitiesTabProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<VolunteerActivity | null>(null)
  const [sortBy, setSortBy] = useState<SortOption>('dateDesc')
  const [formData, setFormData] = useState<VolunteerActivityCreate>({
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

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ['volunteer_activities', user?.id],
    queryFn: () => volunteerActivitiesApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const createMutation = useMutation({
    mutationFn: (data: VolunteerActivityCreate) => volunteerActivitiesApi.create(user!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteer_activities'] })
      setIsDialogOpen(false)
      resetForm()
      toast({ title: t('credentials:volunteerActivities.added') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<VolunteerActivityCreate> }) =>
      volunteerActivitiesApi.update(user!.id, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteer_activities'] })
      setIsDialogOpen(false)
      setEditingItem(null)
      resetForm()
      toast({ title: t('credentials:volunteerActivities.updated') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => volunteerActivitiesApi.delete(user!.id, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteer_activities'] })
      toast({ title: t('credentials:volunteerActivities.deleted') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const resetForm = () => {
    setFormData({
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
  }

  const handleEdit = (item: VolunteerActivity) => {
    setEditingItem(item)
    setFormData({
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
    setIsDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const cleanedData: VolunteerActivityCreate = {
      name: formData.name,
      organization: formData.organization || undefined,
      activity_type: formData.activity_type || undefined,
      start_date: formData.start_date || undefined,
      end_date: formData.end_date || undefined,
      is_current: formData.is_current,
      hours: formData.hours || undefined,
      role: formData.role || undefined,
      description: formData.description || undefined,
      certificate_url: formData.certificate_url || undefined,
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: cleanedData })
    } else {
      createMutation.mutate(cleanedData)
    }
  }

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

  const allItems = itemsData?.data || []
  // Filter items by activityType if provided
  const filteredItems = activityType
    ? allItems.filter(item => item.activity_type === activityType)
    : allItems

  // Sort items based on selected option
  const items = [...filteredItems].sort((a, b) => {
    switch (sortBy) {
      case 'dateDesc':
        return (b.start_date || '').localeCompare(a.start_date || '')
      case 'dateAsc':
        return (a.start_date || '').localeCompare(b.start_date || '')
      case 'nameAsc':
        return a.name.localeCompare(b.name)
      case 'nameDesc':
        return b.name.localeCompare(a.name)
      case 'manual':
      default:
        return a.display_order - b.display_order
    }
  })

  const reorderMutation = useMutation({
    mutationFn: (itemIds: number[]) => volunteerActivitiesApi.reorder(user!.id, itemIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteer_activities'] })
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
        <Button onClick={() => { resetForm(); setEditingItem(null); setIsDialogOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          {t('credentials:volunteerActivities.add')}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">{t('common:loading')}</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Heart className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('credentials:volunteerActivities.empty')}</h3>
            <p className="text-muted-foreground mb-4">{t('credentials:volunteerActivities.emptyDesc')}</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('credentials:volunteerActivities.addFirst')}
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
                    {/* Attachment link (compact) */}
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
              {editingItem ? t('credentials:volunteerActivities.edit') : t('credentials:volunteerActivities.new')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className={activityType ? "" : "grid grid-cols-2 gap-4"}>
              <div className="space-y-2">
                <Label htmlFor="name">{t('credentials:volunteerActivities.name')} *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              {!activityType && (
                <div className="space-y-2">
                  <Label htmlFor="activity_type">{t('credentials:volunteerActivities.type')}</Label>
                  <Select
                    value={formData.activity_type || ''}
                    onValueChange={(value) => setFormData({ ...formData, activity_type: value })}
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
                  value={formData.organization}
                  onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">{t('credentials:volunteerActivities.role')}</Label>
                <Input
                  id="role"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">{t('credentials:volunteerActivities.startDate')}</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date || ''}
                  max={formData.end_date || undefined}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">{t('credentials:volunteerActivities.endDate')}</Label>
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
                onChange={(e) => setFormData({ ...formData, is_current: e.target.checked, end_date: '' })}
              />
              <Label htmlFor="is_current">{t('credentials:volunteerActivities.currentlyActive')}</Label>
            </div>
            {(activityType === 'volunteer' || formData.activity_type === 'volunteer') && (
              <div className="space-y-2">
                <Label htmlFor="hours">{t('credentials:volunteerActivities.hours')}</Label>
                <Input
                  id="hours"
                  type="number"
                  min="0"
                  value={formData.hours || ''}
                  onChange={(e) => setFormData({ ...formData, hours: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="0"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="certificate_url">{t('credentials:volunteerActivities.certificateUrl')}</Label>
              <Input
                id="certificate_url"
                type="url"
                value={formData.certificate_url}
                onChange={(e) => setFormData({ ...formData, certificate_url: e.target.value })}
                placeholder="https://"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('credentials:volunteerActivities.description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder={t('credentials:volunteerActivities.descriptionPlaceholder')}
              />
            </div>
            {/* Attachment upload (only in edit mode) */}
            {editingItem && (
              <div className="space-y-2">
                <Label>{t('credentials:attachment.title')}</Label>
                <AttachmentUpload
                  userId={user!.id}
                  credentialType="volunteer_activities"
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
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingItem ? t('common:edit') : t('common:add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
