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
import { Plus, Pencil, Trash2, ScrollText, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import { AttachmentUpload } from '@/components/AttachmentUpload'

const PATENT_OFFICES = [
  { value: 'KR', label: 'credentials:publications.patentOffices.KR' },
  { value: 'US', label: 'credentials:publications.patentOffices.US' },
  { value: 'EP', label: 'credentials:publications.patentOffices.EP' },
  { value: 'JP', label: 'credentials:publications.patentOffices.JP' },
  { value: 'CN', label: 'credentials:publications.patentOffices.CN' },
  { value: 'PCT', label: 'credentials:publications.patentOffices.PCT' },
  { value: 'other', label: 'credentials:publications.patentOffices.other' },
]

const PATENT_STATUS = [
  { value: 'filed', label: 'credentials:patents.status.filed' },
  { value: 'published', label: 'credentials:patents.status.published' },
  { value: 'granted', label: 'credentials:patents.status.granted' },
  { value: 'rejected', label: 'credentials:patents.status.rejected' },
  { value: 'withdrawn', label: 'credentials:patents.status.withdrawn' },
]

interface PatentFormData {
  title: string
  patent_office: string
  application_number: string
  registration_number: string
  filing_date: string
  publication_date: string
  grant_date: string
  status: string
  applicant: string
  inventors: string
  description: string
}

type SortOption = 'dateDesc' | 'dateAsc' | 'nameAsc' | 'nameDesc' | 'manual'

export function PatentsTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Publication | null>(null)
  const [sortBy, setSortBy] = useState<SortOption>('dateDesc')
  const [formData, setFormData] = useState<PatentFormData>({
    title: '',
    patent_office: '',
    application_number: '',
    registration_number: '',
    filing_date: '',
    publication_date: '',
    grant_date: '',
    status: '',
    applicant: '',
    inventors: '',
    description: '',
  })

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ['publications', user?.id],
    queryFn: () => publicationsApi.getAll(user!.id),
    enabled: !!user?.id,
  })

  // Filter only patent items
  const filteredItems = (itemsData?.data || []).filter(
    (item) => item.publication_type === 'patent'
  )

  // Sort items
  const items = [...filteredItems].sort((a, b) => {
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

  const createMutation = useMutation({
    mutationFn: (data: PublicationCreate) => publicationsApi.create(user!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publications'] })
      setIsDialogOpen(false)
      resetForm()
      toast({ title: t('credentials:patents.added') })
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
      toast({ title: t('credentials:patents.updated') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => publicationsApi.delete(user!.id, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publications'] })
      toast({ title: t('credentials:patents.deleted') })
    },
    onError: () => toast({ title: t('common:error'), variant: 'destructive' }),
  })

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

  const resetForm = () => {
    setFormData({
      title: '',
      patent_office: '',
      application_number: '',
      registration_number: '',
      filing_date: '',
      publication_date: '',
      grant_date: '',
      status: '',
      applicant: '',
      inventors: '',
      description: '',
    })
  }

  // Parse stored patent data from publication fields
  const parsePatentData = (item: Publication): PatentFormData => {
    // We store patent-specific data in existing publication fields:
    // - doi: application_number|registration_number|status
    // - url: patent_office
    // - publisher: applicant
    // - authors: inventors
    // - publication_date: filing_date|publication_date|grant_date
    const doiParts = (item.doi || '').split('|')
    const dateParts = (item.publication_date || '').split('|')

    return {
      title: item.title,
      patent_office: item.url || '',
      application_number: doiParts[0] || '',
      registration_number: doiParts[1] || '',
      status: doiParts[2] || '',
      filing_date: dateParts[0] || '',
      publication_date: dateParts[1] || '',
      grant_date: dateParts[2] || '',
      applicant: item.publisher || '',
      inventors: item.authors || '',
      description: item.description || '',
    }
  }

  const handleEdit = (item: Publication) => {
    setEditingItem(item)
    setFormData(parsePatentData(item))
    setIsDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Pack patent data into publication fields
    const cleanedData: PublicationCreate = {
      title: formData.title,
      publication_type: 'patent',
      doi: [formData.application_number, formData.registration_number, formData.status].join('|'),
      url: formData.patent_office || undefined,
      publisher: formData.applicant || undefined,
      authors: formData.inventors || undefined,
      publication_date: [formData.filing_date, formData.publication_date, formData.grant_date].join('|'),
      description: formData.description || undefined,
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: cleanedData })
    } else {
      createMutation.mutate(cleanedData)
    }
  }

  const getPatentOfficeLabel = (code: string | null) => {
    if (!code) return null
    const option = PATENT_OFFICES.find(o => o.value === code)
    return option ? t(option.label) : code
  }

  const getStatusLabel = (status: string | null) => {
    if (!status) return null
    const option = PATENT_STATUS.find(o => o.value === status)
    return option ? t(option.label) : status
  }

  const getStatusBadgeVariant = (status: string | null) => {
    switch (status) {
      case 'granted': return 'success'
      case 'filed': return 'default'
      case 'published': return 'secondary'
      case 'rejected': return 'destructive'
      case 'withdrawn': return 'outline'
      default: return 'outline'
    }
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
          {t('credentials:patents.add')}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">{t('common:loading')}</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ScrollText className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('credentials:patents.empty')}</h3>
            <p className="text-muted-foreground mb-4">{t('credentials:patents.emptyDesc')}</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('credentials:patents.addFirst')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((item, index) => {
            const patentData = parsePatentData(item)
            return (
              <Card key={item.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <ScrollText className="h-5 w-5 text-amber-600" />
                        <h3 className="text-xl font-semibold">{item.title}</h3>
                        {patentData.status && (
                          <Badge variant={getStatusBadgeVariant(patentData.status)}>
                            {getStatusLabel(patentData.status)}
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {patentData.patent_office && (
                          <p>{t('credentials:patents.patentOffice')}: {getPatentOfficeLabel(patentData.patent_office)}</p>
                        )}
                        {patentData.application_number && (
                          <p>{t('credentials:patents.applicationNumber')}: {patentData.application_number}</p>
                        )}
                        {patentData.registration_number && (
                          <p>{t('credentials:patents.registrationNumber')}: {patentData.registration_number}</p>
                        )}
                        {patentData.filing_date && (
                          <p>{t('credentials:patents.filingDate')}: {formatDate(patentData.filing_date)}</p>
                        )}
                        {patentData.grant_date && (
                          <p>{t('credentials:patents.grantDate')}: {formatDate(patentData.grant_date)}</p>
                        )}
                        {patentData.applicant && (
                          <p>{t('credentials:patents.applicant')}: {patentData.applicant}</p>
                        )}
                        {patentData.inventors && (
                          <p>{t('credentials:patents.inventors')}: {patentData.inventors}</p>
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
            )
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? t('credentials:patents.edit') : t('credentials:patents.new')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t('credentials:patents.title')} *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t('credentials:patents.titlePlaceholder')}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="patent_office">{t('credentials:patents.patentOffice')}</Label>
                <Select
                  value={formData.patent_office || ''}
                  onValueChange={(value) => setFormData({ ...formData, patent_office: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('credentials:patents.selectPatentOffice')} />
                  </SelectTrigger>
                  <SelectContent>
                    {PATENT_OFFICES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">{t('credentials:patents.status.label')}</Label>
                <Select
                  value={formData.status || ''}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('credentials:patents.selectStatus')} />
                  </SelectTrigger>
                  <SelectContent>
                    {PATENT_STATUS.map((option) => (
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
                <Label htmlFor="application_number">{t('credentials:patents.applicationNumber')}</Label>
                <Input
                  id="application_number"
                  value={formData.application_number}
                  onChange={(e) => setFormData({ ...formData, application_number: e.target.value })}
                  placeholder={t('credentials:patents.applicationNumberPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="registration_number">{t('credentials:patents.registrationNumber')}</Label>
                <Input
                  id="registration_number"
                  value={formData.registration_number}
                  onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
                  placeholder={t('credentials:patents.registrationNumberPlaceholder')}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="filing_date">{t('credentials:patents.filingDate')}</Label>
                <Input
                  id="filing_date"
                  type="date"
                  value={formData.filing_date || ''}
                  onChange={(e) => setFormData({ ...formData, filing_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="publication_date">{t('credentials:patents.publicationDate')}</Label>
                <Input
                  id="publication_date"
                  type="date"
                  value={formData.publication_date || ''}
                  onChange={(e) => setFormData({ ...formData, publication_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grant_date">{t('credentials:patents.grantDate')}</Label>
                <Input
                  id="grant_date"
                  type="date"
                  value={formData.grant_date || ''}
                  onChange={(e) => setFormData({ ...formData, grant_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="applicant">{t('credentials:patents.applicant')}</Label>
                <Input
                  id="applicant"
                  value={formData.applicant}
                  onChange={(e) => setFormData({ ...formData, applicant: e.target.value })}
                  placeholder={t('credentials:patents.applicantPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inventors">{t('credentials:patents.inventors')}</Label>
                <Input
                  id="inventors"
                  value={formData.inventors}
                  onChange={(e) => setFormData({ ...formData, inventors: e.target.value })}
                  placeholder={t('credentials:patents.inventorsPlaceholder')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('credentials:patents.description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder={t('credentials:patents.descriptionPlaceholder')}
              />
            </div>

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
