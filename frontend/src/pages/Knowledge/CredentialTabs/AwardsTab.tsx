import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
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
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { awardsApi, Award, AwardCreate } from '@/api/credentials'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, Award as AwardIcon, ExternalLink, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AttachmentUpload } from '@/components/AttachmentUpload'

type SortOption = 'dateDesc' | 'dateAsc' | 'nameAsc' | 'nameDesc' | 'manual'

export function AwardsTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Award | null>(null)
  const [sortBy, setSortBy] = useState<SortOption>('dateDesc')
  const [formData, setFormData] = useState<AwardCreate>({
    name: '',
    issuer: '',
    award_date: '',
    description: '',
    award_url: '',
  })

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ['awards', user?.id],
    queryFn: () => awardsApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const createMutation = useMutation({
    mutationFn: (data: AwardCreate) => awardsApi.create(user!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['awards'] })
      setIsDialogOpen(false)
      resetForm()
      toast({ title: t('credentials:awards.added') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<AwardCreate> }) =>
      awardsApi.update(user!.id, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['awards'] })
      setIsDialogOpen(false)
      setEditingItem(null)
      resetForm()
      toast({ title: t('credentials:awards.updated') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => awardsApi.delete(user!.id, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['awards'] })
      toast({ title: t('credentials:awards.deleted') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const resetForm = () => {
    setFormData({
      name: '',
      issuer: '',
      award_date: '',
      description: '',
      award_url: '',
    })
  }

  const handleEdit = (item: Award) => {
    setEditingItem(item)
    setFormData({
      name: item.name,
      issuer: item.issuer || '',
      award_date: item.award_date || '',
      description: item.description || '',
      award_url: item.award_url || '',
    })
    setIsDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const cleanedData: AwardCreate = {
      name: formData.name,
      issuer: formData.issuer || undefined,
      award_date: formData.award_date || undefined,
      description: formData.description || undefined,
      award_url: formData.award_url || undefined,
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: cleanedData })
    } else {
      createMutation.mutate(cleanedData)
    }
  }

  // Sort items based on selected option
  const sortedItems = [...(itemsData?.data || [])].sort((a, b) => {
    switch (sortBy) {
      case 'dateDesc':
        return (b.award_date || '').localeCompare(a.award_date || '')
      case 'dateAsc':
        return (a.award_date || '').localeCompare(b.award_date || '')
      case 'nameAsc':
        return a.name.localeCompare(b.name)
      case 'nameDesc':
        return b.name.localeCompare(a.name)
      case 'manual':
      default:
        return a.display_order - b.display_order
    }
  })
  const items = sortedItems

  const reorderMutation = useMutation({
    mutationFn: (itemIds: number[]) => awardsApi.reorder(user!.id, itemIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['awards'] })
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
          {t('credentials:awards.add')}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">{t('common:loading')}</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AwardIcon className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('credentials:awards.empty')}</h3>
            <p className="text-muted-foreground mb-4">{t('credentials:awards.emptyDesc')}</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('credentials:awards.addFirst')}
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
                      <AwardIcon className="h-5 w-5 text-yellow-500" />
                      <h3 className="text-xl font-semibold">{item.name}</h3>
                    </div>
                    {item.issuer && (
                      <p className="text-sm text-muted-foreground">
                        {t('credentials:awards.issuer')}: {item.issuer}
                      </p>
                    )}
                    {item.award_date && (
                      <p className="text-sm text-muted-foreground">
                        {t('credentials:awards.awardDate')}: {formatDate(item.award_date)}
                      </p>
                    )}
                    {item.award_url && (
                      <a
                        href={item.award_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-500 hover:underline inline-flex items-center gap-1 mt-1"
                      >
                        {t('credentials:awards.viewDetails')} <ExternalLink className="h-3 w-3" />
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
                          credentialType="awards"
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
              {editingItem ? t('credentials:awards.edit') : t('credentials:awards.new')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('credentials:awards.name')} *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issuer">{t('credentials:awards.issuer')}</Label>
                <Input
                  id="issuer"
                  value={formData.issuer}
                  onChange={(e) => setFormData({ ...formData, issuer: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="award_date">{t('credentials:awards.awardDate')}</Label>
                <Input
                  id="award_date"
                  type="date"
                  value={formData.award_date || ''}
                  onChange={(e) => setFormData({ ...formData, award_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="award_url">{t('credentials:awards.awardUrl')}</Label>
                <Input
                  id="award_url"
                  type="url"
                  value={formData.award_url}
                  onChange={(e) => setFormData({ ...formData, award_url: e.target.value })}
                  placeholder="https://"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('credentials:awards.description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            {/* Attachment upload (only in edit mode) */}
            {editingItem && (
              <div className="space-y-2">
                <Label>{t('credentials:attachment.title')}</Label>
                <AttachmentUpload
                  userId={user!.id}
                  credentialType="awards"
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
