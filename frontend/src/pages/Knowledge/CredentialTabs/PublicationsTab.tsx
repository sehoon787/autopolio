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
import { publicationsApi, Publication, PublicationCreate } from '@/api/credentials'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, FileText, ExternalLink, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import { AttachmentUpload } from '@/components/AttachmentUpload'

const PUBLICATION_TYPES = [
  { value: 'journal', label: 'credentials:publications.types.journal' },
  { value: 'conference', label: 'credentials:publications.types.conference' },
  { value: 'book', label: 'credentials:publications.types.book' },
  { value: 'chapter', label: 'credentials:publications.types.chapter' },
  { value: 'thesis', label: 'credentials:publications.types.thesis' },
  { value: 'preprint', label: 'credentials:publications.types.preprint' },
  { value: 'other', label: 'credentials:publications.types.other' },
]

type SortOption = 'dateDesc' | 'dateAsc' | 'nameAsc' | 'nameDesc' | 'manual'

export function PublicationsTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Publication | null>(null)
  const [sortBy, setSortBy] = useState<SortOption>('dateDesc')
  const [formData, setFormData] = useState<PublicationCreate>({
    title: '',
    authors: '',
    publication_type: '',
    publisher: '',
    publication_date: '',
    doi: '',
    url: '',
    description: '',
  })

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ['publications', user?.id],
    queryFn: () => publicationsApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  const createMutation = useMutation({
    mutationFn: (data: PublicationCreate) => publicationsApi.create(user!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publications'] })
      setIsDialogOpen(false)
      resetForm()
      toast({ title: t('credentials:publications.added') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PublicationCreate> }) =>
      publicationsApi.update(user!.id, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publications'] })
      setIsDialogOpen(false)
      setEditingItem(null)
      resetForm()
      toast({ title: t('credentials:publications.updated') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => publicationsApi.delete(user!.id, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publications'] })
      toast({ title: t('credentials:publications.deleted') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const resetForm = () => {
    setFormData({
      title: '',
      authors: '',
      publication_type: '',
      publisher: '',
      publication_date: '',
      doi: '',
      url: '',
      description: '',
    })
  }

  const handleEdit = (item: Publication) => {
    setEditingItem(item)
    setFormData({
      title: item.title,
      authors: item.authors || '',
      publication_type: item.publication_type || '',
      publisher: item.publisher || '',
      publication_date: item.publication_date || '',
      doi: item.doi || '',
      url: item.url || '',
      description: item.description || '',
    })
    setIsDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const cleanedData: PublicationCreate = {
      title: formData.title,
      authors: formData.authors || undefined,
      publication_type: formData.publication_type || undefined,
      publisher: formData.publisher || undefined,
      publication_date: formData.publication_date || undefined,
      doi: formData.doi || undefined,
      url: formData.url || undefined,
      description: formData.description || undefined,
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: cleanedData })
    } else {
      createMutation.mutate(cleanedData)
    }
  }

  const getTypeLabel = (type: string | null) => {
    if (!type) return null
    const option = PUBLICATION_TYPES.find(o => o.value === type)
    return option ? t(option.label) : type
  }

  const getTypeBadgeVariant = (type: string | null) => {
    switch (type) {
      case 'journal': return 'default'
      case 'conference': return 'secondary'
      case 'book': return 'outline'
      default: return 'outline'
    }
  }

  // Sort items based on selected option
  const sortedItems = [...(itemsData?.data || [])].sort((a, b) => {
    switch (sortBy) {
      case 'dateDesc':
        return (b.publication_date || '').localeCompare(a.publication_date || '')
      case 'dateAsc':
        return (a.publication_date || '').localeCompare(b.publication_date || '')
      case 'nameAsc':
        return a.title.localeCompare(b.title)
      case 'nameDesc':
        return b.title.localeCompare(a.title)
      case 'manual':
      default:
        return a.display_order - b.display_order
    }
  })
  const items = sortedItems

  const reorderMutation = useMutation({
    mutationFn: (itemIds: number[]) => publicationsApi.reorder(user!.id, itemIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publications'] })
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
          {t('credentials:publications.add')}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">{t('common:loading')}</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('credentials:publications.empty')}</h3>
            <p className="text-muted-foreground mb-4">{t('credentials:publications.emptyDesc')}</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('credentials:publications.addFirst')}
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
                      <FileText className="h-5 w-5 text-green-500" />
                      <h3 className="text-xl font-semibold">{item.title}</h3>
                      {item.publication_type && (
                        <Badge variant={getTypeBadgeVariant(item.publication_type)}>
                          {getTypeLabel(item.publication_type)}
                        </Badge>
                      )}
                    </div>
                    {item.authors && (
                      <p className="text-sm text-muted-foreground">
                        {t('credentials:publications.authors')}: {item.authors}
                      </p>
                    )}
                    {item.publisher && (
                      <p className="text-sm text-muted-foreground">
                        {t('credentials:publications.publisher')}: {item.publisher}
                      </p>
                    )}
                    {item.publication_date && (
                      <p className="text-sm text-muted-foreground">
                        {t('credentials:publications.publicationDate')}: {formatDate(item.publication_date)}
                      </p>
                    )}
                    {item.doi && (
                      <p className="text-sm text-muted-foreground">
                        DOI: {item.doi}
                      </p>
                    )}
                    <div className="flex gap-3 mt-2">
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-500 hover:underline inline-flex items-center gap-1"
                        >
                          {t('credentials:publications.viewPublication')} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {item.doi && (
                        <a
                          href={`https://doi.org/${item.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-500 hover:underline inline-flex items-center gap-1"
                        >
                          DOI <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-muted-foreground mt-3">{item.description}</p>
                    )}
                    {/* Attachment link (compact) */}
                    {item.attachment_path && (
                      <div className="mt-2">
                        <AttachmentUpload
                          userId={user!.id}
                          credentialType="publications"
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
              {editingItem ? t('credentials:publications.edit') : t('credentials:publications.new')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t('credentials:publications.title')} *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="authors">{t('credentials:publications.authors')}</Label>
                <Input
                  id="authors"
                  value={formData.authors}
                  onChange={(e) => setFormData({ ...formData, authors: e.target.value })}
                  placeholder={t('credentials:publications.authorsPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="publication_type">{t('credentials:publications.type')}</Label>
                <Select
                  value={formData.publication_type || ''}
                  onValueChange={(value) => setFormData({ ...formData, publication_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('credentials:publications.selectType')} />
                  </SelectTrigger>
                  <SelectContent>
                    {PUBLICATION_TYPES.map((option) => (
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
                <Label htmlFor="publisher">{t('credentials:publications.publisher')}</Label>
                <Input
                  id="publisher"
                  value={formData.publisher}
                  onChange={(e) => setFormData({ ...formData, publisher: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="publication_date">{t('credentials:publications.publicationDate')}</Label>
                <Input
                  id="publication_date"
                  type="date"
                  value={formData.publication_date || ''}
                  onChange={(e) => setFormData({ ...formData, publication_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="doi">DOI</Label>
                <Input
                  id="doi"
                  value={formData.doi}
                  onChange={(e) => setFormData({ ...formData, doi: e.target.value })}
                  placeholder="10.1000/xyz123"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url">{t('credentials:publications.url')}</Label>
                <Input
                  id="url"
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('credentials:publications.description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder={t('credentials:publications.descriptionPlaceholder')}
              />
            </div>
            {/* Attachment upload (only in edit mode) */}
            {editingItem && (
              <div className="space-y-2">
                <Label>{t('credentials:attachment.title')}</Label>
                <AttachmentUpload
                  userId={user!.id}
                  credentialType="publications"
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
