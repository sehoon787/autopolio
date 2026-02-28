import { useEffect } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
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
import { useUserStore } from '@/stores/userStore'
import { awardsApi, Award, AwardCreate } from '@/api/credentials'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, Trophy, ExternalLink, ChevronUp, ChevronDown } from 'lucide-react'
import { AttachmentUpload } from '@/components/AttachmentUpload'
import { useCrudOperations } from '@/hooks/useCrudOperations'
import { useSortableList, SortOption } from '@/hooks/useSortableList'

// Initial form data for awards
const INITIAL_FORM_DATA: AwardCreate = {
  name: '',
  issuer: '',
  award_date: '',
  description: '',
  award_url: '',
}

// Map item to form data for editing
const itemToFormData = (item: Award): AwardCreate => ({
  name: item.name,
  issuer: item.issuer || '',
  award_date: item.award_date || '',
  description: item.description || '',
  award_url: item.award_url || '',
})

// Clean form data before submit (convert empty strings to undefined)
const cleanFormData = (data: AwardCreate): AwardCreate => ({
  name: data.name,
  issuer: data.issuer || undefined,
  award_date: data.award_date || undefined,
  description: data.description || undefined,
  award_url: data.award_url || undefined,
})

interface AwardsTabProps {
  createTrigger?: number
  sortBy?: SortOption
}

export function AwardsTab({ createTrigger, sortBy: externalSortBy }: AwardsTabProps) {
  const { t } = useTranslation()
  const { user } = useUserStore()
  const [animateRef] = useAutoAnimate({ duration: 200 })

  // CRUD operations hook
  const crud = useCrudOperations<Award, AwardCreate>({
    queryKey: 'awards',
    api: awardsApi,
    i18nKey: 'awards',
    initialFormData: INITIAL_FORM_DATA,
    itemToFormData,
    cleanFormData,
  })

  // Sortable list hook
  const sort = useSortableList({
    items: crud.items,
    queryKey: 'awards',
    reorderApi: awardsApi.reorder,
    dateConfig: { dateField: 'award_date' },
  })

  // Sync external sort
  useEffect(() => {
    if (externalSortBy) sort.setSortBy(externalSortBy)
  }, [externalSortBy])

  // Trigger create from parent
  useEffect(() => {
    if (createTrigger && createTrigger > 0) crud.handleCreate()
  }, [createTrigger])

  if (!user) return null

  return (
    <div className="space-y-4">
      {crud.isLoading ? (
        <div className="text-center py-8">{t('common:loading')}</div>
      ) : sort.sortedItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('credentials:awards.empty')}</h3>
            <p className="text-muted-foreground mb-4">{t('credentials:awards.emptyDesc')}</p>
            <Button onClick={crud.handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              {t('credentials:awards.addFirst')}
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
                      <Trophy className="h-5 w-5 text-yellow-500" />
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
              {crud.editingItem ? t('credentials:awards.edit') : t('credentials:awards.new')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={crud.handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('credentials:awards.name')} *</Label>
                <Input
                  id="name"
                  value={crud.formData.name}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issuer">{t('credentials:awards.issuer')}</Label>
                <Input
                  id="issuer"
                  value={crud.formData.issuer}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, issuer: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="award_date">{t('credentials:awards.awardDate')}</Label>
                <Input
                  id="award_date"
                  type="date"
                  value={crud.formData.award_date || ''}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, award_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="award_url">{t('credentials:awards.awardUrl')}</Label>
                <Input
                  id="award_url"
                  type="url"
                  value={crud.formData.award_url}
                  onChange={(e) => crud.setFormData(prev => ({ ...prev, award_url: e.target.value }))}
                  placeholder="https://"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('credentials:awards.description')}</Label>
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
                  credentialType="awards"
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
