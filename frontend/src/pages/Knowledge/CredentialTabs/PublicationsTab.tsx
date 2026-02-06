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
import { publicationsApi, Publication, PublicationCreate } from '@/api/credentials'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, FileText, ExternalLink, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import { AttachmentUpload } from '@/components/AttachmentUpload'
import { useCrudOperations } from '@/hooks/useCrudOperations'
import { useSortableList, SortOption, SORT_OPTIONS } from '@/hooks/useSortableList'

const PUBLICATION_TYPES = [
  { value: 'journal', label: 'credentials:publications.types.journal' },
  { value: 'conference', label: 'credentials:publications.types.conference' },
  { value: 'book', label: 'credentials:publications.types.book' },
  { value: 'chapter', label: 'credentials:publications.types.chapter' },
  { value: 'thesis', label: 'credentials:publications.types.thesis' },
  { value: 'preprint', label: 'credentials:publications.types.preprint' },
  { value: 'other', label: 'credentials:publications.types.other' },
]

// Initial form data for publications
const INITIAL_FORM_DATA: PublicationCreate = {
  title: '',
  authors: '',
  publication_type: '',
  publisher: '',
  publication_date: '',
  doi: '',
  url: '',
  description: '',
}

// Map item to form data for editing
const itemToFormData = (item: Publication): PublicationCreate => ({
  title: item.title,
  authors: item.authors || '',
  publication_type: item.publication_type || '',
  publisher: item.publisher || '',
  publication_date: item.publication_date || '',
  doi: item.doi || '',
  url: item.url || '',
  description: item.description || '',
})

// Clean form data before submit (convert empty strings to undefined)
const cleanFormData = (data: PublicationCreate): PublicationCreate => ({
  title: data.title,
  authors: data.authors || undefined,
  publication_type: data.publication_type || undefined,
  publisher: data.publisher || undefined,
  publication_date: data.publication_date || undefined,
  doi: data.doi || undefined,
  url: data.url || undefined,
  description: data.description || undefined,
})

export function PublicationsTab() {
  const { t } = useTranslation()
  const { user } = useUserStore()

  // CRUD operations hook
  const crud = useCrudOperations<Publication, PublicationCreate>({
    queryKey: 'publications',
    api: publicationsApi,
    i18nKey: 'publications',
    initialFormData: INITIAL_FORM_DATA,
    itemToFormData,
    cleanFormData,
  })

  // Sortable list hook
  const sort = useSortableList({
    items: crud.items,
    queryKey: 'publications',
    reorderApi: publicationsApi.reorder,
    dateConfig: { dateField: 'publication_date' },
    getItemName: (item) => item.title || '',
  })

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
          {t('credentials:publications.add')}
        </Button>
      </div>

      {/* Content */}
      {crud.isLoading ? (
        <div className="text-center py-8">{t('common:loading')}</div>
      ) : sort.sortedItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('credentials:publications.empty')}</h3>
            <p className="text-muted-foreground mb-4">{t('credentials:publications.emptyDesc')}</p>
            <Button onClick={crud.handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              {t('credentials:publications.addFirst')}
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
              {crud.editingItem ? t('credentials:publications.edit') : t('credentials:publications.new')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={crud.handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t('credentials:publications.title')} *</Label>
              <Input
                id="title"
                value={crud.formData.title}
                onChange={(e) => crud.setFormData(prev => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="authors">{t('credentials:publications.authors')}</Label>
                <Input
                  id="authors"
                  value={crud.formData.authors}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, authors: e.target.value }))}
                  placeholder={t('credentials:publications.authorsPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="publication_type">{t('credentials:publications.type')}</Label>
                <Select
                  value={crud.formData.publication_type || ''}
                  onValueChange={(value) => crud.setFormData(prev => ({ ...prev, publication_type: value }))}
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
                  value={crud.formData.publisher}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, publisher: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="publication_date">{t('credentials:publications.publicationDate')}</Label>
                <Input
                  id="publication_date"
                  type="date"
                  value={crud.formData.publication_date || ''}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, publication_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="doi">DOI</Label>
                <Input
                  id="doi"
                  value={crud.formData.doi}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, doi: e.target.value }))}
                  placeholder="10.1000/xyz123"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url">{t('credentials:publications.url')}</Label>
                <Input
                  id="url"
                  type="url"
                  value={crud.formData.url}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('credentials:publications.description')}</Label>
              <Textarea
                id="description"
                value={crud.formData.description}
                onChange={(e) => crud.setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                placeholder={t('credentials:publications.descriptionPlaceholder')}
              />
            </div>
            {crud.editingItem && (
              <div className="space-y-2">
                <Label>{t('credentials:attachment.title')}</Label>
                <AttachmentUpload
                  userId={user!.id}
                  credentialType="publications"
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
