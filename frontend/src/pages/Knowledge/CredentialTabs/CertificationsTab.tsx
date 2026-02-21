import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LoadingState } from '@/components/ui/loading-state'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useUserStore } from '@/stores/userStore'
import { certificationsApi, Certification, CertificationCreate } from '@/api/credentials'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, Medal, ExternalLink, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AttachmentUpload } from '@/components/AttachmentUpload'
import { CertificationAutocomplete } from '@/components/Autocomplete'
import { useCrudOperations } from '@/hooks/useCrudOperations'
import { useSortableList, SortOption, SORT_OPTIONS } from '@/hooks/useSortableList'

// Initial form data for certifications
const INITIAL_FORM_DATA: CertificationCreate = {
  name: '',
  issuer: '',
  issue_date: '',
  expiry_date: '',
  credential_id: '',
  credential_url: '',
  description: '',
}

// Map item to form data for editing
const itemToFormData = (item: Certification): CertificationCreate => ({
  name: item.name,
  issuer: item.issuer || '',
  issue_date: item.issue_date || '',
  expiry_date: item.expiry_date || '',
  credential_id: item.credential_id || '',
  credential_url: item.credential_url || '',
  description: item.description || '',
})

// Clean form data before submit (convert empty strings to undefined)
const cleanFormData = (data: CertificationCreate): CertificationCreate => ({
  name: data.name,
  issuer: data.issuer || undefined,
  issue_date: data.issue_date || undefined,
  expiry_date: data.expiry_date || undefined,
  credential_id: data.credential_id || undefined,
  credential_url: data.credential_url || undefined,
  description: data.description || undefined,
})

export function CertificationsTab() {
  const { t } = useTranslation()
  const { user } = useUserStore()

  // CRUD operations hook
  const crud = useCrudOperations<Certification, CertificationCreate>({
    queryKey: 'certifications',
    api: certificationsApi,
    i18nKey: 'certifications',
    initialFormData: INITIAL_FORM_DATA,
    itemToFormData,
    cleanFormData,
  })

  // Sortable list hook
  const sort = useSortableList({
    items: crud.items,
    queryKey: 'certifications',
    reorderApi: certificationsApi.reorder,
    dateConfig: { dateField: 'issue_date' },
  })

  if (!user) return null

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
          {t('credentials:certifications.add')}
        </Button>
      </div>

      {/* Content */}
      {crud.isLoading ? (
        <LoadingState message={t('common:loading')} />
      ) : sort.sortedItems.length === 0 ? (
        <EmptyState
          icon={Medal}
          title={t('credentials:certifications.empty')}
          description={t('credentials:certifications.emptyDesc')}
          action={{
            label: t('credentials:certifications.addFirst'),
            onClick: crud.handleCreate,
            icon: Plus,
          }}
          withCard
        />
      ) : (
        <div className="grid gap-4">
          {sort.sortedItems.map((item, index) => (
            <Card key={item.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Medal className="h-5 w-5 text-amber-500" />
                      <h3 className="text-xl font-semibold">{item.name}</h3>
                    </div>
                    {item.issuer && (
                      <p className="text-sm text-muted-foreground">
                        {t('credentials:certifications.issuer')}: {item.issuer}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {t('credentials:certifications.issueDate')}: {formatDate(item.issue_date)}
                      {item.expiry_date && ` ~ ${formatDate(item.expiry_date)}`}
                    </p>
                    {item.credential_id && (
                      <p className="text-sm text-muted-foreground">
                        {t('credentials:certifications.credentialId')}: {item.credential_id}
                      </p>
                    )}
                    {item.credential_url && (
                      <a
                        href={item.credential_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-500 hover:underline inline-flex items-center gap-1 mt-1"
                      >
                        {t('credentials:certifications.verify')} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {item.description && (
                      <p className="text-muted-foreground mt-3">{item.description}</p>
                    )}
                    {item.attachment_path && (
                      <div className="mt-2">
                        <AttachmentUpload
                          userId={user!.id}
                          credentialType="certifications"
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
              {crud.editingItem ? t('credentials:certifications.edit') : t('credentials:certifications.new')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={crud.handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('credentials:certifications.name')} *</Label>
                <CertificationAutocomplete
                  value={crud.formData.name}
                  onChange={(name, issuer) => {
                    crud.setFormData(prev => ({
                      ...prev,
                      name,
                      issuer: issuer || prev.issuer,
                    }))
                  }}
                  placeholder={t('credentials:certifications.name')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issuer">{t('credentials:certifications.issuer')}</Label>
                <Input
                  id="issuer"
                  value={crud.formData.issuer}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, issuer: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="issue_date">{t('credentials:certifications.issueDate')}</Label>
                <Input
                  id="issue_date"
                  type="date"
                  value={crud.formData.issue_date || ''}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, issue_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiry_date">{t('credentials:certifications.expiryDate')}</Label>
                <Input
                  id="expiry_date"
                  type="date"
                  value={crud.formData.expiry_date || ''}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, expiry_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="credential_id">{t('credentials:certifications.credentialId')}</Label>
                <Input
                  id="credential_id"
                  value={crud.formData.credential_id}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, credential_id: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="credential_url">{t('credentials:certifications.credentialUrl')}</Label>
                <Input
                  id="credential_url"
                  type="url"
                  value={crud.formData.credential_url}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, credential_url: e.target.value }))}
                  placeholder="https://"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('credentials:certifications.description')}</Label>
              <Textarea
                id="description"
                value={crud.formData.description}
                onChange={(e) => crud.setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>
            {crud.editingItem && (
              <div className="space-y-2">
                <Label>{t('credentials:attachment.title')}</Label>
                <AttachmentUpload
                  userId={user!.id}
                  credentialType="certifications"
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
